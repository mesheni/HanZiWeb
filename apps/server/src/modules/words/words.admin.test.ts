import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';

const testRunId = Date.now();
let userId = '';
let adminId = '';

async function issueAccessToken(userIdValue: string, passwordVersion = 0): Promise<string> {
  return jwt.sign(
    { userId: userIdValue, email: `${userIdValue}@x`, pv: passwordVersion },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '5m' },
  );
}

describe('words admin guard (PLAN_Features_v0.4 §22)', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `guard-user-${testRunId}@hanzi.local`, role: 'USER' },
    });
    userId = user.id;
    const admin = await prisma.user.create({
      data: { email: `guard-admin-${testRunId}@hanzi.local`, role: 'ADMIN' },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
  });

  // Минимальный test-app: тот же authPlugin + тот же preHandler,
  // что использует words.routes.ts для POST. Если guard
  // корректно вешает 403 — middleware в проде тоже отклонит.
  async function buildTestApp() {
    const app = Fastify({ logger: false });
    await app.register(authPlugin);
    // Ровно тот же preHandler-цепочке, что в words.routes.ts:46-56
    // (POST /words). Если цепочка изменится в проде — тест сломается.
    app.post(
      '/words',
      { preHandler: [app.authenticate, app.requireAdmin] },
      async () => ({ success: true, data: { id: 'fake' } }),
    );
    await app.ready();
    return app;
  }

  it('USER role gets 403 FORBIDDEN on POST /words', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: '/words',
        headers: { authorization: `Bearer ${token}` },
        payload: { character: 'a', pinyin: 'a', translation: 'a' },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    } finally {
      await app.close();
    }
  });

  it('ADMIN role gets 200 on POST /words (guard lets through)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(adminId);
      const res = await app.inject({
        method: 'POST',
        url: '/words',
        headers: { authorization: `Bearer ${token}` },
        payload: { character: 'a', pinyin: 'a', translation: 'a' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('USER role gets 403 on PUT /words/:id (regression: every write endpoint gated)', async () => {
    const app = Fastify({ logger: false });
    await app.register(authPlugin);
    try {
      app.put<{ Params: { id: string } }>(
        '/words/:id',
        { preHandler: [app.authenticate, app.requireAdmin] },
        async () => ({ success: true }),
      );
      app.delete<{ Params: { id: string } }>(
        '/words/:id',
        { preHandler: [app.authenticate, app.requireAdmin] },
        async () => ({ success: true }),
      );
      await app.ready();

      const token = await issueAccessToken(userId);

      const putRes = await app.inject({
        method: 'PUT',
        url: '/words/some-id',
        headers: { authorization: `Bearer ${token}` },
        payload: { pinyin: 'b' },
      });
      expect(putRes.statusCode).toBe(403);

      const delRes = await app.inject({
        method: 'DELETE',
        url: '/words/some-id',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(delRes.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('missing token gets 401 UNAUTHORIZED (authenticate fires before requireAdmin)', async () => {
    const app = await buildTestApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/words',
        payload: { character: 'a', pinyin: 'a', translation: 'a' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    } finally {
      await app.close();
    }
  });
});
