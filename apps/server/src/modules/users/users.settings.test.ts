import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';
import { usersRoutes } from './users.routes.js';
import { updateUserSettings } from './users.service.js';
import { getActivityData } from '../stats/stats.service.js';

// User.timezone был незаписываемым через API — стрик/heatmap навсегда
// жили на UTC-ветке (fix v0.4 §24/§25 follow-up). Теперь PUT
// /users/settings принимает IANA-таймзону, и daily-статистика
// группируется по локальному дню пользователя.

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
  await app.register(authPlugin);
  await app.register(usersRoutes, { prefix: '/users' });
  await app.ready();
  return app;
}

describe('user settings timezone (fix v0.4 §24/§25 follow-up)', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `tz-user-${testRunId}@hanzi.local` },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
  });

  it('PUT /users/settings { timezone: "Europe/Moscow" } → 200, поле записано в БД', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'PUT',
        url: '/users/settings',
        headers: { authorization: `Bearer ${token}` },
        payload: { timezone: 'Europe/Moscow' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.timezone).toBe('Europe/Moscow');

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.timezone).toBe('Europe/Moscow');
    } finally {
      await app.close();
    }
  });

  it('GET /users/settings возвращает сохранённую таймзону', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'GET',
        url: '/users/settings',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.timezone).toBe('Europe/Moscow');
    } finally {
      await app.close();
    }
  });

  it('невалидная IANA-таймзона → 400 VALIDATION_ERROR', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'PUT',
        url: '/users/settings',
        headers: { authorization: `Bearer ${token}` },
        payload: { timezone: 'Mars/Olympus' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });

  it('getActivityData группирует по локальному дню сохранённой таймзоны (не UTC)', async () => {
    // Готовим ответ 2026-07-15T23:30Z: для Москвы это уже 2026-07-16.
    const uid = userId;
    const word = await prisma.word.create({
      data: {
        character: `时${testRunId}`,
        pinyin: 'shí',
        translation: 'time',
      },
    });
    wordId = word.id;
    const session = await prisma.session.create({
      data: { userId: uid, cardsTotal: 1, mode: 'mixed', practiceType: 'flip-card' },
    });
    await prisma.sessionAnswer.create({
      data: {
        sessionId: session.id,
        wordId,
        rating: 3,
        answeredAt: new Date('2026-07-15T23:30:00.000Z'),
      },
    });

    await updateUserSettings(uid, { timezone: 'Europe/Moscow' });

    const data = await getActivityData(uid, 2026);
    const map = new Map(data.map((d) => [d.date, d.count]));
    // Москва: 23:30 UTC 15-го = 02:30 16-го локально.
    expect(map.get('2026-07-16') ?? 0).toBe(1);
    expect(map.get('2026-07-15') ?? 0).toBe(0);
  });

  it('PUT { timezone: null } сбрасывает таймзону на UTC; dailyGoal не затирается', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'PUT',
        url: '/users/settings',
        headers: { authorization: `Bearer ${token}` },
        payload: { timezone: null, dailyGoal: 42 },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.timezone).toBeNull();
      expect(body.data.dailyGoal).toBe(42);

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.timezone).toBeNull();
      expect(user?.dailyGoal).toBe(42);
    } finally {
      await app.close();
    }
  });
});
