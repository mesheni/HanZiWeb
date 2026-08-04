import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

const { saveMock, existsMock, fileMock, bucketMock } = vi.hoisted(() => {
  const saveMock = vi.fn().mockResolvedValue(undefined);
  const existsMock = vi.fn();
  const fileMock = vi.fn(() => ({ save: saveMock, exists: existsMock }));
  return {
    saveMock,
    existsMock,
    fileMock,
    bucketMock: vi.fn(() => ({ file: fileMock })),
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket = bucketMock;
  },
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
  afterAll(() => {
    delete process.env.GCS_BUCKET_NAME;
    saveMock.mockClear();
    existsMock.mockClear();
    fileMock.mockClear();
    bucketMock.mockClear();
  });

  it('save: bucket.file(name).save с contentType audio/mpeg', async () => {
    const storage = createGcsStorage(loadConfig());
    await storage.save('abc.mp3', Buffer.from('MP3'));
    expect(bucketMock).toHaveBeenCalledWith('test-bucket');
    expect(fileMock).toHaveBeenCalledWith('abc.mp3');
    expect(saveMock).toHaveBeenCalledWith(Buffer.from('MP3'), {
      contentType: 'audio/mpeg',
      resumable: false,
    });
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
});
