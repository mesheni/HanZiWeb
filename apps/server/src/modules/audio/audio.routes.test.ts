import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';
import { audioRoutes } from './audio.routes.js';

const { generateAudioMock, generateAudioForWordMock, forwardMock } = vi.hoisted(() => ({
  generateAudioMock: vi.fn(),
  generateAudioForWordMock: vi.fn(),
  forwardMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./audio.service.js', () => ({
  generateAudio: generateAudioMock,
  generateAudioForWord: generateAudioForWordMock,
  readAudioFile: vi.fn(),
}));

vi.mock('../analytics/analytics.service.js', () => ({
  forward: forwardMock,
}));

const testRunId = Date.now();
let userId = '';
let adminId = '';

async function issueAccessToken(id: string): Promise<string> {
  return jwt.sign({ userId: id, email: `${id}@x`, pv: 0 }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: '5m',
  });
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  // Тот же маппинг ZodError → 400, что в глобальном error handler'е index.ts.
  // Регистрируем ДО роутов: в Fastify v5 error handler родителя, вызванный
  // после `register`, не видит ошибки из капсулированного дочернего контекста.
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }
    throw error;
  });
  await app.register(authPlugin);
  await app.register(audioRoutes, { prefix: '/audio' });
  await app.ready();
  return app;
}

describe('POST /audio/generate — платный TTS guard (PLAN_Features_v0.4 §31)', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `audio-user-${testRunId}@hanzi.local`, role: 'USER' },
    });
    userId = user.id;
    const admin = await prisma.user.create({
      data: { email: `audio-admin-${testRunId}@hanzi.local`, role: 'ADMIN' },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
  });

  beforeEach(() => {
    generateAudioMock.mockReset();
    generateAudioForWordMock.mockReset();
    generateAudioMock.mockResolvedValue({ audioUrl: 'http://x/1.mp3', source: 'generated' });
    generateAudioForWordMock.mockResolvedValue({ audioUrl: 'http://x/2.mp3', source: 'generated' });
    forwardMock.mockClear();
  });

  it('USER с free text → 403 FORBIDDEN, генерация не вызывается', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: '/audio/generate',
        headers: { authorization: `Bearer ${token}` },
        payload: { text: '任意文本' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
      expect(generateAudioMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('USER с wordId → 200, generateAudioForWord, произвольный text не уходит в TTS', async () => {
    const app = await buildTestApp();
    try {
      const wordId = randomUUID();
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: '/audio/generate',
        headers: { authorization: `Bearer ${token}` },
        payload: { text: 'произвольный текст', wordId },
      });
      expect(res.statusCode).toBe(200);
      expect(generateAudioForWordMock).toHaveBeenCalledWith(wordId, 'zh-CN', { userId });
      expect(generateAudioMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('USER с wordId без text → 200 (text не обязателен при wordId)', async () => {
    const app = await buildTestApp();
    try {
      const wordId = randomUUID();
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: '/audio/generate',
        headers: { authorization: `Bearer ${token}` },
        payload: { wordId },
      });
      expect(res.statusCode).toBe(200);
      expect(generateAudioForWordMock).toHaveBeenCalledWith(wordId, 'zh-CN', { userId });
    } finally {
      await app.close();
    }
  });

  it('ADMIN с free text → 200, generateAudio с переданным текстом', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(adminId);
      const res = await app.inject({
        method: 'POST',
        url: '/audio/generate',
        headers: { authorization: `Bearer ${token}` },
        payload: { text: '任意文本', language: 'zh-CN' },
      });
      expect(res.statusCode).toBe(200);
      expect(generateAudioMock).toHaveBeenCalledWith('任意文本', 'zh-CN', { userId: adminId });
      expect(generateAudioForWordMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('ни wordId, ни text → 400 (Zod refine)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: '/audio/generate',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(generateAudioMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('без токена → 401', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/audio/generate',
        payload: { wordId: randomUUID() },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
