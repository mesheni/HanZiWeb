import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import observabilityPlugin from './observability.js';

// F27: structured observability — каждый ответ несёт x-request-id,
// по которому можно трейсить запрос по pino-логам.

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(observabilityPlugin);
  app.get('/ok', async () => ({ ok: true }));
  app.get('/err', async () => {
    throw new Error('boom');
  });
  app.get('/custom', async (_request, reply) => {
    reply.header('x-request-id', 'custom-id');
    return { ok: true };
  });
  await app.ready();
  return app;
}

describe('observability x-request-id (F27)', () => {
  it('успешный ответ содержит x-request-id', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/ok' });
      expect(res.statusCode).toBe(200);
      const rid = String(res.headers['x-request-id'] ?? '');
      expect(rid.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('ответ с ошибкой 500 тоже содержит x-request-id', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/err' });
      expect(res.statusCode).toBe(500);
      expect(typeof res.headers['x-request-id']).toBe('string');
    } finally {
      await app.close();
    }
  });

  it('явно заданный заголовок не перезаписывается', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/custom' });
      expect(res.headers['x-request-id']).toBe('custom-id');
    } finally {
      await app.close();
    }
  });
});
