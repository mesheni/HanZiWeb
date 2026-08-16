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

describe('GET /texts — знакомость и сортировка (v0.7)', () => {
  const runId = `${testRunId}-f`;
  let famUserId = '';
  let wordA = '';
  let wordB = '';
  let textAll: string;
  let textHalf: string;

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `reading-fam-${runId}@hanzi.local` },
    });
    famUserId = u.id;

    const a = await prisma.word.create({
      data: { character: `熟${runId}甲`, pinyin: 'shú', translation: 'known-a' },
    });
    const b = await prisma.word.create({
      data: { character: `生${runId}乙`, pinyin: 'shēng', translation: 'unknown-b' },
    });
    wordA = a.id;
    wordB = b.id;

    // Текст из 2 известных токенов → 100%.
    const t1 = await prisma.readingText.create({
      data: {
        title: `Familiar 100 ${runId}`,
        content: '甲甲',
        hskLevel: 1,
        wordCount: 2,
      },
    });
    await prisma.readingTextWord.createMany({
      data: [
        { textId: t1.id, wordId: wordA, position: 0, length: 1 },
        { textId: t1.id, wordId: wordA, position: 1, length: 1 },
      ],
    });
    textAll = t1.id;

    // Текст: 1 известный + 1 неизвестный токен → 50%.
    const t2 = await prisma.readingText.create({
      data: {
        title: `Familiar 50 ${runId}`,
        content: '甲乙',
        hskLevel: 1,
        wordCount: 2,
      },
    });
    await prisma.readingTextWord.createMany({
      data: [
        { textId: t2.id, wordId: wordA, position: 0, length: 1 },
        { textId: t2.id, wordId: wordB, position: 1, length: 1 },
      ],
    });
    textHalf = t2.id;

    // Известен только первый токен (wordA).
    await prisma.userWordProgress.create({
      data: { userId: famUserId, wordId: wordA, state: 'review' },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: famUserId } });
    await prisma.readingText.deleteMany({ where: { id: { in: [textAll, textHalf] } } });
    await prisma.word.deleteMany({ where: { id: { in: [wordA, wordB] } } });
  });

  it('familiarPercent считается по токенам текста', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(famUserId);
      const res = await app.inject({
        method: 'GET',
        url: '/texts',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const items = res.json().data as Array<{
        id: string;
        familiarPercent: number;
        knownWordsCount: number;
      }>;
      const all = items.find((i) => i.id === textAll);
      const half = items.find((i) => i.id === textHalf);
      expect(all?.familiarPercent).toBe(100);
      expect(half?.familiarPercent).toBe(50);
      expect(half?.knownWordsCount).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('sort=familiarity — от самого знакомого к новому', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(famUserId);
      const res = await app.inject({
        method: 'GET',
        url: '/texts?sort=familiarity',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const items = res.json().data as Array<{ id: string; familiarPercent: number }>;
      const idxAll = items.findIndex((i) => i.id === textAll);
      const idxHalf = items.findIndex((i) => i.id === textHalf);
      expect(idxAll).toBeGreaterThanOrEqual(0);
      expect(idxHalf).toBeGreaterThanOrEqual(0);
      expect(idxAll).toBeLessThan(idxHalf);
    } finally {
      await app.close();
    }
  });
});
