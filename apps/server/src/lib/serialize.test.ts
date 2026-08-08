import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { normalizeBigInts } from './serialize.js';

describe('normalizeBigInts', () => {
  it('преобразует BigInt в number в пределах safe range', () => {
    expect(normalizeBigInts(123456789n)).toBe(123456789);
    expect(normalizeBigInts(-5n)).toBe(-5);
    expect(normalizeBigInts(0n)).toBe(0);
  });

  it('преобразует BigInt за пределами safe range в строку (без потери точности)', () => {
    const huge = 2n ** 64n;
    expect(normalizeBigInts(huge)).toBe(huge.toString());
    expect(typeof normalizeBigInts(huge)).toBe('string');
  });

  it('рекурсивно проходит вложенные объекты и массивы', () => {
    const payload = {
      data: { examples: [{ tatoebaId: 42n, text: '你好' }, { tatoebaId: null }] },
      meta: [1n, 2n],
    };
    expect(normalizeBigInts(payload)).toEqual({
      data: { examples: [{ tatoebaId: 42, text: '你好' }, { tatoebaId: null }] },
      meta: [1, 2],
    });
  });

  it('сохраняет Date и другие классы без изменений', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const payload = { createdAt: date, nested: { d: date } };
    const result = normalizeBigInts(payload) as { createdAt: Date };
    expect(result.createdAt).toBe(date);
  });

  it('возвращает ту же ссылку, если BigInt в payload нет', () => {
    const payload = { a: 1, b: 'x', c: { d: true } };
    expect(normalizeBigInts(payload)).toBe(payload);
  });

  it('не трогает примитивы', () => {
    expect(normalizeBigInts('str')).toBe('str');
    expect(normalizeBigInts(null)).toBeNull();
    expect(normalizeBigInts(undefined)).toBeUndefined();
    expect(normalizeBigInts(3.14)).toBe(3.14);
    expect(normalizeBigInts(true)).toBe(true);
  });
});

describe('preSerialization хук (регрессия F01)', () => {
  const examplePayload = {
    success: true,
    data: {
      examples: [
        {
          id: 'e1',
          tatoebaId: 1234567890n,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    },
  };

  function buildApp(withHook: boolean) {
    const app = Fastify({ logger: false });
    if (withHook) {
      app.addHook('preSerialization', async (_req, _reply, payload) => normalizeBigInts(payload));
    }
    app.get('/word', async () => examplePayload);
    return app;
  }

  it('ответ с BigInt в payload не падает: 200, tatoebaId приходит number', async () => {
    const app = buildApp(true);
    try {
      const res = await app.inject({ method: 'GET', url: '/word' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.examples[0].tatoebaId).toBe(1234567890);
      expect(typeof body.data.examples[0].tatoebaId).toBe('number');
    } finally {
      await app.close();
    }
  });

  it('без хука тот же payload даёт 500 (доказывает наличие бага F01)', async () => {
    const app = buildApp(false);
    try {
      const res = await app.inject({ method: 'GET', url: '/word' });
      expect(res.statusCode).toBe(500);
    } finally {
      await app.close();
    }
  });
});
