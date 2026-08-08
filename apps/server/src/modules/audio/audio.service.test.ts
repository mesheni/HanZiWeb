import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig } from '../../config.js';
import {
  createLocalStorage,
  createGcsStorage,
  resolveStorage,
  generateAudio,
} from './audio.service.js';

const {
  saveMock,
  existsMock,
  makePublicMock,
  getMetadataMock,
  fileMock,
  bucketMock,
  incrMock,
  expireMock,
} = vi.hoisted(() => {
  const saveMock = vi.fn().mockResolvedValue(undefined);
  const existsMock = vi.fn();
  const makePublicMock = vi.fn().mockResolvedValue(undefined);
  // F15: UBL-режим бакета. По умолчанию UBL выключен (legacy) — makePublic
  // должен вызываться; отдельные тесты переключают в UBL.
  const getMetadataMock = vi
    .fn()
    .mockResolvedValue([{ iamConfiguration: { uniformBucketLevelAccess: { enabled: false } } }]);
  const fileMock = vi.fn(() => ({
    save: saveMock,
    exists: existsMock,
    makePublic: makePublicMock,
  }));
  return {
    saveMock,
    existsMock,
    makePublicMock,
    getMetadataMock,
    fileMock,
    bucketMock: vi.fn(() => ({ file: fileMock, getMetadata: getMetadataMock })),
    incrMock: vi.fn(),
    expireMock: vi.fn(),
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket = bucketMock;
  },
}));

// Redis для per-user лимита генераций (PLANCorrection #19).
vi.mock('../../lib/redis.js', () => ({
  getRedis: () => ({ incr: incrMock, expire: expireMock }),
}));

function sha1(text: string, language: string): string {
  return createHash('sha1').update(`${language}:${text}`).digest('hex') + '.mp3';
}

describe('resolveStorage — режимы хранения (PLAN_Features_v0.4 §30)', () => {
  it('без GCS_BUCKET_NAME → local backend с AUDIO_PUBLIC_BASE_URL', () => {
    delete process.env.GCS_BUCKET_NAME;
    const cfg = loadConfig();
    const storage = resolveStorage(cfg);
    expect(storage.publicUrl('abc.mp3')).toBe(`${cfg.AUDIO_PUBLIC_BASE_URL}/abc.mp3`);
  });

  it('с GCS_BUCKET_NAME → gcs backend с https://storage.googleapis.com/<bucket>/', () => {
    process.env.GCS_BUCKET_NAME = 'hanzi-audio';
    const cfg = loadConfig();
    const storage = resolveStorage(cfg);
    expect(storage.publicUrl('abc.mp3')).toBe('https://storage.googleapis.com/hanzi-audio/abc.mp3');
    delete process.env.GCS_BUCKET_NAME;
  });
});

describe('createLocalStorage', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'hanzi-audio-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('save → exists → publicUrl', async () => {
    const cfg = loadConfig();
    const storage = createLocalStorage({ ...cfg, AUDIO_STORAGE_PATH: dir });
    const file = 'abc.mp3';
    expect(await storage.exists(file)).toBe(false);
    await storage.save(file, Buffer.from('MP3'));
    expect(await storage.exists(file)).toBe(true);
    expect(existsSync(join(dir, file))).toBe(true);
    expect(storage.publicUrl(file)).toBe(`${cfg.AUDIO_PUBLIC_BASE_URL}/${file}`);
  });
});

describe('createGcsStorage', () => {
  beforeAll(() => {
    process.env.GCS_BUCKET_NAME = 'test-bucket';
  });
  beforeEach(() => {
    saveMock.mockClear();
    existsMock.mockClear();
    makePublicMock.mockClear();
    getMetadataMock.mockClear();
    fileMock.mockClear();
    bucketMock.mockClear();
    // Дефолт: legacy-бакет без UBL (makePublic разрешён).
    getMetadataMock.mockResolvedValue([
      { iamConfiguration: { uniformBucketLevelAccess: { enabled: false } } },
    ]);
  });
  afterAll(() => {
    delete process.env.GCS_BUCKET_NAME;
  });

  it('save: bucket.file(name).save с contentType audio/mpeg + makePublic после загрузки', async () => {
    const storage = createGcsStorage(loadConfig());
    await storage.save('abc.mp3', Buffer.from('MP3'));
    expect(bucketMock).toHaveBeenCalledWith('test-bucket');
    expect(fileMock).toHaveBeenCalledWith('abc.mp3');
    expect(saveMock).toHaveBeenCalledWith(Buffer.from('MP3'), {
      contentType: 'audio/mpeg',
      resumable: false,
    });
    // Legacy-бакет (UBL выключен): объект публикуется на чтение —
    // иначе publicUrl() отдавал бы 403 (PLANCorrection #18).
    expect(makePublicMock).toHaveBeenCalledTimes(1);
  });

  it('UBL-бакет (uniform bucket level access) → makePublic НЕ вызывается (F15)', async () => {
    getMetadataMock.mockResolvedValue([
      { iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } },
    ]);
    const storage = createGcsStorage(loadConfig());
    await storage.save('abc.mp3', Buffer.from('MP3'));
    expect(saveMock).toHaveBeenCalledTimes(1);
    // Per-object ACL на UBL-бакете запрещён (403) — публикация на
    // уровне бакета, объекты публикуются автоматически.
    expect(makePublicMock).not.toHaveBeenCalled();
  });

  it('ошибка чтения метаданных бакета → makePublic пропускается (F15, fail-safe)', async () => {
    getMetadataMock.mockRejectedValue(new Error('permission denied'));
    const storage = createGcsStorage(loadConfig());
    await storage.save('abc.mp3', Buffer.from('MP3'));
    // Не знаем режим — предполагаем UBL: сломанная генерация (403 от
    // makePublic после оплаты TTS) хуже приватного объекта.
    expect(makePublicMock).not.toHaveBeenCalled();
  });

  it('exists: bucket.file(name).exists', async () => {
    existsMock.mockResolvedValue([true]);
    const storage = createGcsStorage(loadConfig());
    expect(await storage.exists('abc.mp3')).toBe(true);
    expect(fileMock).toHaveBeenCalledWith('abc.mp3');
  });
});

describe('generateAudio — GCS upload + кэш (PLAN_Features_v0.4 §30)', () => {
  let credentialsPath = '';
  const fetchMock = vi.fn();

  async function pemFromWebCrypto(): Promise<string> {
    const key = await globalThis.crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign'],
    );
    const pkcs8 = await globalThis.crypto.subtle.exportKey('pkcs8', key.privateKey);
    const b64 = Buffer.from(pkcs8).toString('base64');
    const lines = b64.match(/.{1,64}/g)!.join('\n');
    return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
  }

  beforeAll(async () => {
    process.env.GCS_BUCKET_NAME = 'test-bucket';
    credentialsPath = join(tmpdir(), `hanzi-tts-creds-${Date.now()}.json`);
    const pem = await pemFromWebCrypto();
    writeFileSync(
      credentialsPath,
      JSON.stringify({ client_email: 'tts@test.iam.gserviceaccount.com', private_key: pem }),
    );
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com/token')) {
        return { ok: true, json: async () => ({ access_token: 'test-token' }) };
      }
      if (u.includes('texttospeech.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({ audioContent: Buffer.from('FAKE-MP3').toString('base64') }),
        };
      }
      throw new Error(`unexpected fetch URL: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterAll(() => {
    delete process.env.GCS_BUCKET_NAME;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    rmSync(credentialsPath, { force: true });
    vi.unstubAllGlobals();
  });

  it('generated: TTS → upload в GCS → возвращает GCS URL', async () => {
    existsMock.mockResolvedValue([false]);
    fetchMock.mockClear();
    saveMock.mockClear();
    makePublicMock.mockClear();
    fileMock.mockClear();

    const result = await generateAudio('你好', 'zh-CN');

    expect(result.source).toBe('generated');
    expect(result.audioUrl).toBe(
      `https://storage.googleapis.com/test-bucket/${sha1('你好', 'zh-CN')}`,
    );
    expect(fileMock).toHaveBeenCalledWith(sha1('你好', 'zh-CN'));
    expect(saveMock).toHaveBeenCalledWith(Buffer.from('FAKE-MP3'), {
      contentType: 'audio/mpeg',
      resumable: false,
    });
    // TTS + oauth token — оба запроса ушли
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('cache hit: файл уже в GCS → TTS не вызывается', async () => {
    existsMock.mockResolvedValue([true]);
    fetchMock.mockClear();

    const result = await generateAudio('你好', 'zh-CN');

    expect(result.source).toBe('cache');
    expect(result.audioUrl).toBe(
      `https://storage.googleapis.com/test-bucket/${sha1('你好', 'zh-CN')}`,
    );
    // Ни одного запроса наружу (ни token, ни TTS)
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('per-user лимит: 100 cache-miss генераций проходят, 101-я → 429 TTS_QUOTA_EXCEEDED', async () => {
    existsMock.mockResolvedValue([false]);
    fetchMock.mockClear();
    saveMock.mockClear();
    let count = 0;
    incrMock.mockImplementation(async () => ++count);
    expireMock.mockResolvedValue(1);

    try {
      for (let i = 0; i < 100; i++) {
        const r = await generateAudio(`слово-${i}`, 'zh-CN', { userId: 'u1' });
        expect(r.source).toBe('generated');
      }

      await expect(generateAudio('слово-101', 'zh-CN', { userId: 'u1' })).rejects.toMatchObject({
        statusCode: 429,
        code: 'TTS_QUOTA_EXCEEDED',
      });
      // Лимит проверяется ДО вызова платного TTS: 101-й запрос не сгенерировал.
      expect(incrMock).toHaveBeenCalledTimes(101);
    } finally {
      incrMock.mockReset();
    }
  });

  it('per-user лимит: cache-hit не инкрементит счётчик', async () => {
    existsMock.mockResolvedValue([true]);
    incrMock.mockReset();
    fetchMock.mockClear();

    const r = await generateAudio('你好', 'zh-CN', { userId: 'u1' });
    expect(r.source).toBe('cache');
    expect(incrMock).not.toHaveBeenCalled();
  });

  it('без userId лимит не применяется (скрипт generateAudioForAllMissingWords)', async () => {
    existsMock.mockResolvedValue([false]);
    incrMock.mockReset();
    fetchMock.mockClear();
    saveMock.mockClear();

    const r = await generateAudio('скрипт', 'zh-CN');
    expect(r.source).toBe('generated');
    expect(incrMock).not.toHaveBeenCalled();
  });

  it('без Google-credentials → 501, квота НЕ тратится (F15)', async () => {
    // Раньше consumeGenerationQuota вызывался ДО проверки credentials —
    // каждый 501 сжигал дневной лимит пользователя.
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    existsMock.mockResolvedValue([false]);
    incrMock.mockReset();
    fetchMock.mockClear();

    try {
      await expect(generateAudio('некс', 'zh-CN', { userId: 'u1' })).rejects.toMatchObject({
        statusCode: 501,
        code: 'TTS_NOT_CONFIGURED',
      });
      expect(incrMock).not.toHaveBeenCalled();
    } finally {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
    }
  });

  it('таймаут token-exchange → 502 TTS_PROVIDER_ERROR, квота НЕ тратится (F15)', async () => {
    existsMock.mockResolvedValue([false]);
    incrMock.mockReset();
    fetchMock.mockClear();
    fetchMock.mockImplementationOnce(async () => {
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    });

    await expect(generateAudio('таймаут', 'zh-CN', { userId: 'u1' })).rejects.toMatchObject({
      statusCode: 502,
      code: 'TTS_PROVIDER_ERROR',
    });
    // Падение на этапе token'а — до списания квоты.
    expect(incrMock).not.toHaveBeenCalled();
  });

  it('таймаут TTS-вызова → 502 TTS_PROVIDER_ERROR (F15)', async () => {
    existsMock.mockResolvedValue([false]);
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return { ok: true, json: async () => ({ access_token: 'test-token' }) };
      }
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    });

    await expect(generateAudio('таймаут-tts', 'zh-CN')).rejects.toMatchObject({
      statusCode: 502,
      code: 'TTS_PROVIDER_ERROR',
    });
  });
});
