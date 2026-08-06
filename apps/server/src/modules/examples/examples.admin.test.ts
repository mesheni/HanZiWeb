import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';
import { examplesRoutes } from './examples.routes.js';

// Tatoeba не дёргаем в тестах: fetch-эндпоинт с мокнутым upstream
// возвращает «ничего не добавлено», а не уходит в реальный HTTP.
vi.mock('../../lib/tatoeba.js', () => ({
  getSentencesWithTranslations: vi.fn().mockResolvedValue([]),
  getTranslationsForSentence: vi.fn().mockResolvedValue([]),
  pickRussianTranslation: vi.fn().mockReturnValue(null),
}));

const testRunId = Date.now();
let userId = '';
let adminId = '';
let wordId = '';

async function issueAccessToken(id: string): Promise<string> {
  return jwt.sign({ userId: id, email: `${id}@x`, pv: 0 }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: '5m',
  });
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
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
  await app.register(examplesRoutes);
  await app.ready();
  return app;
}

describe('examples write guard (fix v0.4 §22 follow-up)', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `ex-guard-user-${testRunId}@hanzi.local`, role: 'USER' },
    });
    userId = user.id;
    const admin = await prisma.user.create({
      data: { email: `ex-guard-admin-${testRunId}@hanzi.local`, role: 'ADMIN' },
    });
    adminId = admin.id;
    const word = await prisma.word.create({
      data: {
        character: `例${testRunId}`,
        pinyin: 'lì',
        translation: 'example',
      },
    });
    wordId = word.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
  });

  it('USER → 403 на POST /words/:wordId/examples (создание примера)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: `/words/${wordId}/examples`,
        headers: { authorization: `Bearer ${token}` },
        payload: { chinese: '你好', russian: 'Привет' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    } finally {
      await app.close();
    }
  });

  it('USER → 403 на DELETE /words/:wordId/examples/:exampleId', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'DELETE',
        url: `/words/${wordId}/examples/some-example-id`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    } finally {
      await app.close();
    }
  });

  it('USER → 403 на POST /words/:wordId/examples/fetch (исходящий HTTP к Tatoeba)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: `/words/${wordId}/examples/fetch`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    } finally {
      await app.close();
    }
  });

  it('ADMIN → 201 на POST (ручное создание) и 200 на DELETE', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(adminId);

      const createdRes = await app.inject({
        method: 'POST',
        url: `/words/${wordId}/examples`,
        headers: { authorization: `Bearer ${token}` },
        payload: { chinese: '你好', russian: 'Привет' },
      });
      expect(createdRes.statusCode).toBe(201);
      const exampleId = createdRes.json().data.id as string;
      expect(exampleId).toBeTruthy();

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/words/${wordId}/examples/${exampleId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().success).toBe(true);

      const remaining = await prisma.example.findMany({ where: { wordId } });
      expect(remaining).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('ADMIN → 200 на POST fetch (Tatoeba замокан)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(adminId);
      const res = await app.inject({
        method: 'POST',
        url: `/words/${wordId}/examples/fetch?limit=2`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.added).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('USER → 200 на GET (чтение примеров остаётся открытым)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'GET',
        url: `/words/${wordId}/examples`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    } finally {
      await app.close();
    }
  });
});
