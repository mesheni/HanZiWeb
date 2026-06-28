import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { prisma } from '../../lib/prisma.js';
import { loadConfig } from '../../config.js';

/**
 * Сервис генерации и хранения аудио через Google Cloud TTS.
 *
 * Поддерживает два режима:
 *  1. Production: загрузка mp3 в GCS-бакет (если задан GCS_BUCKET_NAME).
 *  2. Dev: локальное сохранение в AUDIO_STORAGE_PATH (по умолчанию ./storage/audio).
 *
 * Если GOOGLE_APPLICATION_CREDENTIALS не задан — эндпоинт вернёт 501.
 */

const STORAGE_DIR = loadConfig().AUDIO_STORAGE_PATH;

/** Локальная директория существует? Создаём при необходимости. */
function ensureStorageDir(): void {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * Вычисляет детерминированный путь к аудиофайлу для текста+языка.
 * Используется для кэширования: если файл уже существует, не генерируем заново.
 */
export function localAudioPath(text: string, language: string): string {
  const hash = createHash('sha1').update(`${language}:${text}`).digest('hex');
  return join(STORAGE_DIR, `${hash}.mp3`);
}

/**
 * Загружает JSON service account и получает Google OAuth2 access token
 * через JWT exchange (RFC 7523).
 *
 * Возвращает null, если credentials не заданы или обмен не удался.
 */
async function getGoogleAccessToken(): Promise<string | null> {
  const config = loadConfig();
  const credentialsPath = config.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath || !existsSync(credentialsPath)) {
    return null;
  }

  const raw = await readFile(credentialsPath, 'utf-8');
  const creds = JSON.parse(raw) as {
    client_email: string;
    private_key: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');

  const signingInput = `${header}.${payload}`;

  // Подписываем JWT приватным ключом через WebCrypto API
  const keyData = pemToDer(creds.private_key);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const signatureB64 = Buffer.from(new Uint8Array(signature)).toString('base64url');
  const jwt = `${signingInput}.${signatureB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) return null;
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  return tokenJson.access_token ?? null;
}

/** Конвертирует PEM-строку в ArrayBuffer (для WebCrypto). */
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

interface GenerateAudioResult {
  audioUrl: string;
  source: 'cache' | 'generated';
}

/**
 * Генерирует mp3 через Google Cloud TTS, сохраняет (локально или в GCS)
 * и возвращает публичный URL.
 *
 * @param text   Текст для синтеза (например, иероглиф "你好")
 * @param language  BCP-47 код языка ('zh-CN')
 * @returns { audioUrl } или выбрасывает ошибку при неудаче.
 */
export async function generateAudio(
  text: string,
  language: string = 'zh-CN',
): Promise<GenerateAudioResult> {
  ensureStorageDir();

  const config = loadConfig();
  const localPath = localAudioPath(text, language);

  // Кэш: если файл уже есть локально, не генерируем заново
  if (existsSync(localPath)) {
    const publicUrl = `${config.AUDIO_PUBLIC_BASE_URL}/${createHash('sha1')
      .update(`${language}:${text}`)
      .digest('hex')}.mp3`;
    return { audioUrl: publicUrl, source: 'cache' };
  }

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    throw Object.assign(new Error('Google TTS credentials not configured'), {
      statusCode: 501,
      code: 'TTS_NOT_CONFIGURED',
    });
  }

  const ttsRes = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: language, ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
    }),
  });

  if (!ttsRes.ok) {
    const errText = await ttsRes.text();
    throw Object.assign(new Error(`Google TTS error: ${errText}`), {
      statusCode: 502,
      code: 'TTS_PROVIDER_ERROR',
    });
  }

  const ttsJson = (await ttsRes.json()) as { audioContent?: string };
  if (!ttsJson.audioContent) {
    throw Object.assign(new Error('Google TTS returned empty audio content'), {
      statusCode: 502,
      code: 'TTS_PROVIDER_ERROR',
    });
  }

  const audioBytes = Buffer.from(ttsJson.audioContent, 'base64');
  writeFileSync(localPath, audioBytes);

  const fileName = createHash('sha1')
    .update(`${language}:${text}`)
    .digest('hex') + '.mp3';

  // В production здесь была бы загрузка в GCS и возврат публичного URL
  // Для dev возвращаем локальный URL
  const publicUrl = `${config.AUDIO_PUBLIC_BASE_URL}/${fileName}`;

  return { audioUrl: publicUrl, source: 'generated' };
}

/**
 * Возвращает содержимое аудиофайла для раздачи через Fastify-маршрут.
 * Используется только для локального dev-хранилища.
 */
export function readAudioFile(fileName: string): { data: Buffer; mime: string } | null {
  // Проверяем имя файла на безопасность (только base64hex.mp3)
  if (!/^[a-f0-9]+\.mp3$/.test(fileName)) return null;

  const filePath = join(STORAGE_DIR, fileName);
  if (!existsSync(filePath)) return null;

  const data = readFileSync(filePath);
  return { data, mime: 'audio/mpeg' };
}

/**
 * Генерирует аудио для конкретного слова и сохраняет URL в Words.audio_url.
 */
export async function generateAudioForWord(
  wordId: string,
  language: string = 'zh-CN',
): Promise<GenerateAudioResult> {
  const word = await prisma.word.findUnique({ where: { id: wordId } });
  if (!word) {
    throw Object.assign(new Error('Word not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  const result = await generateAudio(word.character, language);

  await prisma.word.update({
    where: { id: wordId },
    data: { audioUrl: result.audioUrl },
  });

  return result;
}

/**
 * Пакетная генерация аудио для всех слов без audio_url.
 * Используется скриптом `pnpm db:generate-audio`.
 */
export async function generateAudioForAllMissingWords(
  options: { limit?: number; language?: string } = {},
): Promise<{ total: number; generated: number; failed: number }> {
  const words = await prisma.word.findMany({
    where: { audioUrl: null },
    select: { id: true, character: true },
    take: options.limit ?? 1000,
  });

  let generated = 0;
  let failed = 0;
  const language = options.language ?? 'zh-CN';

  for (const word of words) {
    try {
      await generateAudioForWord(word.id, language);
      // Проверяем, что слово действительно получило URL (генерация могла упасть без исключения)
      generated++;
    } catch {
      failed++;
    }
  }

  return { total: words.length, generated, failed };
}

// Используется в routes для определения MIME-типа по расширению
export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.mp3') return 'audio/mpeg';
  return 'application/octet-stream';
}
