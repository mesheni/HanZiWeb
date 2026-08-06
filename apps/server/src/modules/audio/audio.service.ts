import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Storage, type Bucket } from '@google-cloud/storage';
import { prisma } from '../../lib/prisma.js';
import { getRedis } from '../../lib/redis.js';
import { loadConfig, type Config } from '../../config.js';

/**
 * Сервис генерации и хранения аудио через Google Cloud TTS.
 *
 * Поддерживает два режима (PLAN_Features_v0.4 §30):
 *  1. Production: mp3 загружается в GCS-бакет (GCS_BUCKET_NAME задан),
 *     публичный URL — `https://storage.googleapis.com/<bucket>/<file>`.
 *     Объект публикуется на чтение сразу при загрузке
 *     (`file.makePublic()`), поэтому бакет может быть приватным
 *     (uniform bucket-level access) — service account нужны права
 *     storage.objectAdmin (PLANCorrection #18).
 *  2. Dev: локальное сохранение в AUDIO_STORAGE_PATH и раздача через
 *     GET /audio/files/:fileName.
 *
 * Если GOOGLE_APPLICATION_CREDENTIALS не задан — эндпоинт вернёт 501.
 */

const STORAGE_DIR = loadConfig().AUDIO_STORAGE_PATH;

/** Имя файла детерминировано от текста+языка — это и есть ключ кэша. */
function fileNameFor(text: string, language: string): string {
  return createHash('sha1').update(`${language}:${text}`).digest('hex') + '.mp3';
}

/** Абстракция хранения, чтобы GCS и локальный режим были взаимозаменяемы. */
export interface AudioStorage {
  exists(fileName: string): Promise<boolean>;
  save(fileName: string, bytes: Buffer): Promise<void>;
  publicUrl(fileName: string): string;
}

/** Локальный dev-режим: файлы на диске, раздача через /audio/files. */
export function createLocalStorage(config: Config): AudioStorage {
  const dir = config.AUDIO_STORAGE_PATH;
  return {
    async exists(fileName) {
      return existsSync(join(dir, fileName));
    },
    async save(fileName, bytes) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, fileName), bytes);
    },
    publicUrl(fileName) {
      return `${config.AUDIO_PUBLIC_BASE_URL}/${fileName}`;
    },
  };
}

/** Production-режим: mp3 загружается в GCS-бакет. */
export function createGcsStorage(config: Config): AudioStorage {
  const storage = new Storage();
  const bucket: Bucket = storage.bucket(config.GCS_BUCKET_NAME!);
  return {
    async exists(fileName) {
      const [ok] = await bucket.file(fileName).exists();
      return ok;
    },
    async save(fileName, bytes) {
      const file = bucket.file(fileName);
      await file.save(bytes, {
        contentType: 'audio/mpeg',
        resumable: false,
      });
      // Публикуем объект на чтение сразу после загрузки: при приватном
      // бакете (uniform bucket-level access — дефолт новых проектов)
      // publicUrl() без этого отдавал бы 403. Требование к ролям
      // service account — storage.objectAdmin (PLANCorrection #18).
      await file.makePublic();
    },
    publicUrl(fileName) {
      return `https://storage.googleapis.com/${config.GCS_BUCKET_NAME}/${fileName}`;
    },
  };
}

/** Выбор режима хранения по конфигу: GCS задан → gcs, иначе → local. */
export function resolveStorage(config: Config = loadConfig()): AudioStorage {
  return config.GCS_BUCKET_NAME ? createGcsStorage(config) : createLocalStorage(config);
}

/** Локальная директория существует? Создаём при необходимости. */
function ensureStorageDir(): void {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/** Дневной лимит платных TTS-генераций на пользователя (PLANCorrection #19). */
const DAILY_GENERATION_LIMIT = 100;
/** TTL Redis-счётчика — сутки (UTC-день в ключе). */
const QUOTA_TTL_SECONDS = 24 * 60 * 60;

/**
 * Per-user дневной лимит платных TTS-генераций (PLANCorrection #19).
 *
 * Считаются ТОЛЬКО cache-miss'ы — вызов происходит после проверки
 * кэша в `generateAudio`, поэтому повторный запрос уже закэшированного
 * файла счётчик не трогает. INCR атомарен: 101-я генерация за сутки
 * получает 429 до вызова платного TTS. При недоступности Redis лимит
 * fail-open — генерация не блокируется (глобальный rate limit и так
 * деградирует без Redis).
 */
async function consumeGenerationQuota(userId: string): Promise<void> {
  let count: number;
  try {
    const redis = getRedis();
    const key = `audio:gen:${userId}:${new Date().toISOString().slice(0, 10)}`;
    count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, QUOTA_TTL_SECONDS);
    }
  } catch (err) {
    console.error('TTS quota check failed', err);
    return;
  }
  if (count > DAILY_GENERATION_LIMIT) {
    throw Object.assign(new Error('Daily TTS generation limit exceeded'), {
      statusCode: 429,
      code: 'TTS_QUOTA_EXCEEDED',
    });
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
 * Кэш проверяется через выбранный backend (локальный диск или GCS),
 * поэтому повторные запросы одного текста не тратят платный TTS.
 *
 * @param text   Текст для синтеза (например, иероглиф "你好")
 * @param language  BCP-47 код языка ('zh-CN')
 * @param options   `userId` — включает per-user дневной лимит генераций
 *                  (только cache-miss'ы; см. consumeGenerationQuota)
 * @returns { audioUrl } или выбрасывает ошибку при неудаче.
 */
export async function generateAudio(
  text: string,
  language: string = 'zh-CN',
  options: { userId?: string } = {},
): Promise<GenerateAudioResult> {
  ensureStorageDir();

  const config = loadConfig();
  const storage = resolveStorage(config);
  const fileName = fileNameFor(text, language);

  // Кэш: если файл уже есть в хранилище, не генерируем заново
  if (await storage.exists(fileName)) {
    return { audioUrl: storage.publicUrl(fileName), source: 'cache' };
  }

  // Per-user дневной лимит платных генераций — только cache-miss'ы
  // тратят TTS (PLANCorrection #19). Скрипты (без userId) не лимитируются.
  if (options.userId) {
    await consumeGenerationQuota(options.userId);
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
  await storage.save(fileName, audioBytes);

  return { audioUrl: storage.publicUrl(fileName), source: 'generated' };
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
 * Текст всегда берётся из `Word.character` — переданный клиентом текст
 * не участвует в синтезе (PLAN_Features_v0.4 §31).
 */
export async function generateAudioForWord(
  wordId: string,
  language: string = 'zh-CN',
  options: { userId?: string } = {},
): Promise<GenerateAudioResult> {
  const word = await prisma.word.findUnique({ where: { id: wordId } });
  if (!word) {
    throw Object.assign(new Error('Word not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  const result = await generateAudio(word.character, language, options);

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
