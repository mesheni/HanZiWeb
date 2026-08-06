import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';
import { statsRoutes } from './stats.routes.js';

// Валидация query /stats/activity (PLANCorrection #20): до фикса
// year/month парсились через parseInt без схемы — `?year=abc` давал
// NaN, который тёк в getActivityData (мусорный ответ/500 вместо 400).
// Теперь Zod-схема (coerce int, year 2000-2100, month 1-12) → ZodError
// → 400 VALIDATION_ERROR через тот же маппинг, что в глобальном
// error handler'е index.ts.

const testRunId = Date.now();
let userId = '';

async function issueAccessToken(id: string): Promise<string> {
  return jwt.sign({ userId: id, email: `${id}@x`, pv: 0 }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: '5m',
  });
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  // Тот же маппинг ZodError → 400, что в глобальном error handler'е index.ts.
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
  await app.register(statsRoutes, { prefix: '/stats' });
  await app.ready();
  return app;
}

describe('GET /stats/activity — валидация year/month (PLANCorrection #20)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `stats-activity-${testRunId}@hanzi.local`, role: 'USER' },
    });
    userId = u.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('year=abc → 400 VALIDATION_ERROR (не NaN и не 500)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'GET',
        url: '/stats/activity?year=abc',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });

  it('year вне диапазона (1900) → 400', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'GET',
        url: '/stats/activity?year=1900',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });

  it('year вне диапазона (2200) → 400', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'GET',
        url: '/stats/activity?year=2200',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });

  it('month=13 → 400', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'GET',
        url: '/stats/activity?year=2026&month=13',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });

  it('month=0 → 400', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'GET',
        url: '/stats/activity?month=0',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });

  it('year=2026&month=7 → 200 (валидные параметры; пустой прогресс = пустой ответ)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'GET',
        url: '/stats/activity?year=2026&month=7',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().data).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('без параметров → 200 (дефолт — текущий год)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'GET',
        url: '/stats/activity',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    } finally {
      await app.close();
    }
  });
});
