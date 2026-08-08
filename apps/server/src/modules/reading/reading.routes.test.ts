import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';
import { readingRoutes } from './reading.routes.js';

// F14: POST /texts/:id/progress для несуществующего текста молча
// возвращал success — markRead делал `if (!text) return`. Теперь 404
// NOT_FOUND, как в GET /texts/:id.

const testRunId = Date.now();
let userId = '';
let textId = '';

async function issueAccessToken(id: string): Promise<string> {
  return jwt.sign({ userId: id, email: `${id}@x`, pv: 0 }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: '5m',
  });
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  // Тот же маппинг, что в глобальном error handler'е index.ts:
  // ZodError → 400, явный statusCode ≥ 400 → как есть.
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }
    const err = error as { statusCode?: unknown; code?: unknown; message?: unknown };
    if (typeof err.statusCode === 'number' && err.statusCode >= 400) {
      return reply.status(err.statusCode).send({
        success: false,
        error: {
          code: String(err.code ?? 'ERROR'),
          message: String(err.message ?? 'Request error'),
        },
      });
    }
    throw error;
  });
  await app.register(authPlugin);
  // reading.routes.ts уже содержит префикс `/texts` в своих путях.
  await app.register(readingRoutes);
  await app.ready();
  return app;
}

describe('POST /texts/:id/progress — markRead (F14)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `reading-f14-${testRunId}@hanzi.local`, role: 'USER' },
    });
    userId = u.id;
    const text = await prisma.readingText.create({
      data: {
        title: `F14 test ${testRunId}`,
        content: '你好，世界。',
        hskLevel: 1,
        wordCount: 2,
      },
    });
    textId = text.id;
  });

  afterAll(async () => {
    if (textId) await prisma.readingText.deleteMany({ where: { id: textId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('несуществующий текст → 404 NOT_FOUND (не success)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: '/texts/00000000-0000-4000-8000-000000000000/progress',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().success).toBe(false);
      expect(res.json().error.code).toBe('NOT_FOUND');
    } finally {
      await app.close();
    }
  });

  it('существующий текст → 200 и прогресс создаётся', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: `/texts/${textId}/progress`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);

      const progress = await prisma.userReadingProgress.findUnique({
        where: { userId_textId: { userId, textId } },
      });
      expect(progress).not.toBeNull();
    } finally {
      await app.close();
    }
  });

  it('повторный вызов идемпотентен (upsert, readAt обновляется)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: `/texts/${textId}/progress`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);

      const rows = await prisma.userReadingProgress.findMany({
        where: { userId, textId },
      });
      expect(rows).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('невалидный UUID в параметре → 400 VALIDATION_ERROR', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: '/texts/not-a-uuid/progress',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });
});
