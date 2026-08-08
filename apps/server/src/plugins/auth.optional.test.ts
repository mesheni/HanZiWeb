import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { prisma } from '../lib/prisma.js';
import authPlugin from './auth.js';
import { generateAccessToken } from '../modules/auth/auth.service.js';

// F10: revoked access token (после смены пароля) не должен проходить
// optional-auth. Раньше `authenticateOptional` сверял только подпись JWT,
// но не `pv` (passwordVersion) — старый access-токен продолжал читать
// персональные данные (userProgress в словаре, аналитика от имени юзера)
// через optional-эндпоинты (GET /words, GET /words/:id, /feature-flags,
// /etymology, /analytics/ingest).

const testRunId = Date.now();
let userId = '';
let email = '';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(authPlugin);
  app.get('/whoami', { preHandler: [app.authenticateOptional] }, async (request) => {
    return { userId: request.userId };
  });
  await app.ready();
  return app;
}

describe('authenticateOptional — revoked access token (F10)', () => {
  beforeAll(async () => {
    email = `optional-${testRunId}@hanzi.local`;
    const u = await prisma.user.create({ data: { email } });
    userId = u.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('без токена — аноним (userId пустой)', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/whoami' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ userId: '' });
    } finally {
      await app.close();
    }
  });

  it('валидный токен (pv = passwordVersion) — userId установлен', async () => {
    const app = await buildTestApp();
    try {
      // У свежего пользователя passwordVersion = 0.
      const token = generateAccessToken(userId, email, 0);
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ userId });
    } finally {
      await app.close();
    }
  });

  it('revoked-токен (pv устарел после смены пароля) — аноним', async () => {
    const app = await buildTestApp();
    try {
      // Токен выпущен с pv=0, а серверный passwordVersion уже 1
      // (смена пароля инвалидирует все старые access-токены).
      const token = generateAccessToken(userId, email, 0);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordVersion: { increment: 1 } },
      });
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ userId: '' });
      // Восстанавливаем pv, чтобы не влиять на другие тесты.
      await prisma.user.update({
        where: { id: userId },
        data: { passwordVersion: { decrement: 1 } },
      });
    } finally {
      await app.close();
    }
  });

  it('невалидный токен — аноним', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        headers: { authorization: 'Bearer not-a-jwt' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ userId: '' });
    } finally {
      await app.close();
    }
  });
});
