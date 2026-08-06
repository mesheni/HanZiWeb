import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { ZodError } from 'zod';
import { prisma } from '../../lib/prisma.js';
import authPlugin from '../../plugins/auth.js';
import { authRoutes } from './auth.routes.js';
import { generateRefreshToken } from './auth.service.js';

// Body-refreshToken только для non-browser клиентов (fix v0.4 §47
// follow-up): `X-Client-Type: mobile` сам по себе спуфабелен — XSS на
// web-оригине подделывает заголовок и вытаскивает refreshToken в
// JS-читаемое тело. Дополнительный гейт — отсутствие `Origin`:
// браузер всегда шлёт его на POST, RN fetch — нет.

const testRunId = Date.now();
let userId = '';

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

/** Токен с АКТУАЛЬНЫМ tokenVersion пользователя (CAS-ротация не ломает тест). */
async function currentRefreshToken(): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return generateRefreshToken(userId, user!.tokenVersion);
}

describe('POST /auth/refresh — refreshToken в теле только без Origin (fix v0.4 §47 follow-up)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `tokenbody-${testRunId}@hanzi.local`, tokenVersion: 1 },
    });
    userId = u.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('X-Client-Type: mobile + Origin (подделка заголовка из браузерного JS) → refreshToken в теле ОТСУТСТВУЕТ', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/refresh',
        headers: { 'x-client-type': 'mobile', origin: 'http://localhost:5173' },
        payload: { refreshToken: await currentRefreshToken() },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.refreshToken).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('X-Client-Type: mobile без Origin (настоящий RN) → refreshToken в теле + Cache-Control: no-store', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/refresh',
        headers: { 'x-client-type': 'mobile' },
        payload: { refreshToken: await currentRefreshToken() },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.refreshToken).toBeTruthy();
      expect(res.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });

  it('без X-Client-Type (обычный web-клиент) → refreshToken в теле ОТСУТСТВУЕТ', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken: await currentRefreshToken() },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.refreshToken).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
