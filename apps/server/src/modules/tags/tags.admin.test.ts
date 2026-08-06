import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';
import { tagsRoutes } from './tags.routes.js';

// Теги — общий контент словаря (у Tag нет ownerId): все мутации
// (POST/DELETE /tags, PUT /words/:id/tags) только для ADMIN
// (fix v0.4 §22 follow-up), чтение остаётся открытым.

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
  await app.register(tagsRoutes, { prefix: '/tags' });
  await app.ready();
  return app;
}

describe('tags write guard (fix v0.4 §22 follow-up)', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `tag-guard-user-${testRunId}@hanzi.local`, role: 'USER' },
    });
    userId = user.id;
    const admin = await prisma.user.create({
      data: { email: `tag-guard-admin-${testRunId}@hanzi.local`, role: 'ADMIN' },
    });
    adminId = admin.id;
    const word = await prisma.word.create({
      data: {
        character: `标${testRunId}`,
        pinyin: 'biāo',
        translation: 'tag',
      },
    });
    wordId = word.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
  });

  it('USER → 403 на POST /tags (создание тега)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'POST',
        url: '/tags',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'С трудным тоном', slug: `hard-tones-${testRunId}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    } finally {
      await app.close();
    }
  });

  it('USER → 403 на DELETE /tags/:id', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'DELETE',
        url: '/tags/some-tag-id',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    } finally {
      await app.close();
    }
  });

  it('USER → 403 на PUT /words/:wordId/tags (переприсваивание)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'PUT',
        url: `/tags/words/${wordId}/tags`,
        headers: { authorization: `Bearer ${token}` },
        payload: { tagIds: [] },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    } finally {
      await app.close();
    }
  });

  it('ADMIN: POST /tags → 201, PUT /words/:id/tags → 200, DELETE /tags/:id → 200', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(adminId);

      const createdRes = await app.inject({
        method: 'POST',
        url: '/tags',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'С трудным тоном', slug: `hard-tones-${testRunId}` },
      });
      expect(createdRes.statusCode).toBe(201);
      const tagId = createdRes.json().data.id as string;
      expect(tagId).toBeTruthy();

      const putRes = await app.inject({
        method: 'PUT',
        url: `/tags/words/${wordId}/tags`,
        headers: { authorization: `Bearer ${token}` },
        payload: { tagIds: [tagId] },
      });
      expect(putRes.statusCode).toBe(200);
      expect(putRes.json().success).toBe(true);

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/tags/${tagId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().success).toBe(true);

      const remaining = await prisma.tag.findUnique({ where: { id: tagId } });
      expect(remaining).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('USER → 200 на GET /tags (чтение остаётся открытым)', async () => {
    const app = await buildTestApp();
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'GET',
        url: '/tags',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    } finally {
      await app.close();
    }
  });
});
