import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { prisma } from '../../lib/prisma.js';
import authPlugin from '../../plugins/auth.js';
import { authRoutes } from './auth.routes.js';

// F28c: полное удаление аккаунта — каскады сносят все связанные
// записи; повторный запрос после удаления — 401 USER_NOT_FOUND.

const testRunId = Date.now();
let userId = '';
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
  await app.register(cookie);
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.ready();
  return app;
}

describe('DELETE /auth/account (F28c)', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `delacc-${testRunId}@hanzi.local` },
    });
    userId = user.id;

    const word = await prisma.word.create({
      data: { character: `删${testRunId}`, pinyin: 'shān', translation: 'delete' },
    });
    wordId = word.id;

    const session = await prisma.session.create({
      data: { userId, cardsTotal: 1, mode: 'mixed', practiceType: 'flip-card' },
    });
    await prisma.sessionAnswer.create({
      data: { sessionId: session.id, wordId, rating: 3 },
    });
    await prisma.userWordProgress.create({
      data: { userId, wordId, state: 'learning', reps: 1 },
    });
    await prisma.userAchievement.create({
      data: { userId, type: 'first_session' },
    });
    await prisma.userDevice.create({
      data: { userId, fcmToken: `delacc-tok-${testRunId}` },
    });
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
  });

  it('без токена → 401', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({ method: 'DELETE', url: '/account' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    } finally {
      await app.close();
    }
  });

  it('удаляет аккаунт и все связанные записи (каскады)', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({
        method: 'DELETE',
        url: '/account',
        headers: { authorization: `Bearer ${await issueAccessToken(userId)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ deleted: true });

      expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
      expect(await prisma.userDevice.count({ where: { userId } })).toBe(0);
      expect(await prisma.session.count({ where: { userId } })).toBe(0);
      expect(await prisma.sessionAnswer.count({ where: { session: { userId } } })).toBe(0);
      expect(await prisma.userWordProgress.count({ where: { userId } })).toBe(0);
      expect(await prisma.userAchievement.count({ where: { userId } })).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('повторный запрос с прежним токеном → 401 USER_NOT_FOUND', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({
        method: 'DELETE',
        url: '/account',
        headers: { authorization: `Bearer ${await issueAccessToken(userId)}` },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('USER_NOT_FOUND');
    } finally {
      await app.close();
    }
  });
});
