import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';
import { devicesRoutes } from './devices.routes.js';

// F27: устройства/пуши были единственным модулем без тестов. Покрываем
// регистрацию (включая перепривязку токена к другому аккаунту),
// отписку, VAPID-ключ и настройки уведомлений.

const testRunId = Date.now();
const users: string[] = [];

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
  await app.register(devicesRoutes, { prefix: '/devices' });
  await app.ready();
  return app;
}

async function createUser(tag: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `${tag}-${testRunId}@hanzi.local` },
  });
  users.push(user.id);
  return user.id;
}

describe('devices (F27)', () => {
  beforeAll(async () => {
    await createUser('dev-a');
    await createUser('dev-b');
  });

  afterAll(async () => {
    await prisma.userDevice.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('GET /devices/vapid-public-key — публичный, отдаёт строку', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/devices/vapid-public-key' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(typeof body.data.publicKey).toBe('string');
    } finally {
      await app.close();
    }
  });

  it('POST /devices без токена → 401', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/devices',
        payload: { fcmToken: 'tok-401' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    } finally {
      await app.close();
    }
  });

  it('POST /devices → 201 { registered: true }, запись в БД', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(users[0]!);
      const res = await app.inject({
        method: 'POST',
        url: '/devices',
        headers: { authorization: `Bearer ${token}` },
        payload: { fcmToken: `tok-${testRunId}-1` },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data).toEqual({ registered: true });

      const device = await prisma.userDevice.findUnique({
        where: { fcmToken: `tok-${testRunId}-1` },
      });
      expect(device?.userId).toBe(users[0]);
      expect(device?.platform).toBe('web');
    } finally {
      await app.close();
    }
  });

  it('повторный POST тем же токеном — идемпотентен, запись одна', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(users[0]!);
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/devices',
          headers: { authorization: `Bearer ${token}` },
          payload: { fcmToken: `tok-${testRunId}-2` },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().data.registered).toBe(true);
      }
      const count = await prisma.userDevice.count({
        where: { fcmToken: `tok-${testRunId}-2` },
      });
      expect(count).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('POST /devices — чужой токен перепривязывается к новому аккаунту', async () => {
    const app = await buildTestApp();
    try {
      const tokenA = await issueAccessToken(users[0]!);
      const resA = await app.inject({
        method: 'POST',
        url: '/devices',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { fcmToken: `tok-${testRunId}-3`, platform: 'mobile' },
      });
      expect(resA.statusCode).toBe(201);

      const tokenB = await issueAccessToken(users[1]!);
      const resB = await app.inject({
        method: 'POST',
        url: '/devices',
        headers: { authorization: `Bearer ${tokenB}` },
        payload: { fcmToken: `tok-${testRunId}-3`, platform: 'mobile' },
      });
      expect(resB.statusCode).toBe(201);

      const device = await prisma.userDevice.findUnique({
        where: { fcmToken: `tok-${testRunId}-3` },
      });
      expect(device?.userId).toBe(users[1]);
    } finally {
      await app.close();
    }
  });

  it('DELETE /devices/:token — отписка, повторный вызов идемпотентен', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(users[0]!);
      await app.inject({
        method: 'POST',
        url: '/devices',
        headers: { authorization: `Bearer ${token}` },
        payload: { fcmToken: `tok-${testRunId}-del` },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: `/devices/tok-${testRunId}-del`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ unregistered: true });

      const remaining = await prisma.userDevice.count({
        where: { fcmToken: `tok-${testRunId}-del` },
      });
      expect(remaining).toBe(0);

      const res2 = await app.inject({
        method: 'DELETE',
        url: `/devices/tok-${testRunId}-del`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().data.unregistered).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('GET /devices/notification-settings — дефолты из БД', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(users[0]!);
      const res = await app.inject({
        method: 'GET',
        url: '/devices/notification-settings',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.notificationEnabled).toBe(false);
      expect(data.notificationTime).toBe('morning');
      expect(data.notificationFrequency).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('PUT /devices/notification-settings — обновляет и отдаёт 3 поля', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(users[0]!);
      const res = await app.inject({
        method: 'PUT',
        url: '/devices/notification-settings',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          notificationEnabled: true,
          notificationTime: 'evening',
          notificationFrequency: 3,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({
        notificationEnabled: true,
        notificationTime: 'evening',
        notificationFrequency: 3,
      });

      const user = await prisma.user.findUnique({ where: { id: users[0]! } });
      expect(user?.notificationEnabled).toBe(true);
      expect(user?.notificationTime).toBe('evening');
      expect(user?.notificationFrequency).toBe(3);
    } finally {
      await app.close();
    }
  });

  it('PUT /devices/notification-settings — невалидный notificationTime → 400', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(users[0]!);
      const res = await app.inject({
        method: 'PUT',
        url: '/devices/notification-settings',
        headers: { authorization: `Bearer ${token}` },
        payload: { notificationEnabled: true, notificationTime: 'midnight' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });
});
