import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { WordRow } from './tests.service.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    word: { findMany: vi.fn() },
  },
}));

// In-memory Redis: setex кладёт значение, get его читает — чтобы тест
// F18 мог заглянуть в серверную запись сессии (с correctAnswer).
const { redisStore } = vi.hoisted(() => ({ redisStore: new Map<string, string>() }));

vi.mock('../../lib/redis.js', () => ({
  getRedis: () => ({
    setex: vi.fn().mockImplementation(async (key: string, _ttl: number, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    }),
    get: vi.fn().mockImplementation(async (key: string) => redisStore.get(key) ?? null),
    del: vi.fn().mockResolvedValue(1),
  }),
}));

import { generateTest, loadTestSession } from './tests.service.js';
import { prisma } from '../../lib/prisma.js';

const findManyMock = prisma.word.findMany as ReturnType<typeof vi.fn>;

function mkWords(n: number): WordRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: randomUUID(),
    character: `字${i}`,
    pinyin: 'pi',
    translation: `tr${i}`,
    hskLevel: 5,
    audioUrl: null,
    examples: [],
  }));
}

describe('generateTest question-count contract — PLAN_Features_v0.4 §39', () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it('sparse level (< 20 words) throws INSUFFICIENT_WORDS instead of a silent short test', async () => {
    findManyMock.mockResolvedValue(mkWords(10));
    await expect(generateTest('user-1', { level: 5 })).rejects.toMatchObject({
      code: 'INSUFFICIENT_WORDS',
    });
  });

  it('exactly the minimum (20 words) still generates a valid test', async () => {
    findManyMock.mockResolvedValue(mkWords(20));
    const session = await generateTest('user-1', { level: 5 });
    expect(session.questions.length).toBeGreaterThanOrEqual(20);
    expect(session.questions.length).toBeLessThanOrEqual(30);
  });

  it('25 words produce 20-30 questions (contract preserved)', async () => {
    findManyMock.mockResolvedValue(mkWords(25));
    const session = await generateTest('user-1', { level: 5 });
    expect(session.questions.length).toBe(25);
    expect(session.questions.length).toBeGreaterThanOrEqual(20);
    expect(session.questions.length).toBeLessThanOrEqual(30);
  });

  it('large level is capped at 30 questions', async () => {
    findManyMock.mockResolvedValue(mkWords(100));
    const session = await generateTest('user-1', { level: 5 });
    expect(session.questions.length).toBeLessThanOrEqual(30);
  });

  it('F18: публичный DTO вопросов не содержит correctAnswer, в Redis-записи ответы остаются', async () => {
    findManyMock.mockResolvedValue(mkWords(25));
    const session = await generateTest('user-1', { level: 5 });
    expect(session.questions.length).toBeGreaterThan(0);

    // Клиентский DTO: ответов нет (F18 — иначе они видны в DevTools
    // до отправки).
    for (const q of session.questions) {
      expect(q).not.toHaveProperty('correctAnswer');
    }

    // Серверная запись сессии (Redis): correctAnswer на месте —
    // submitTest градирует по ней, а не по клиентским данным.
    const record = await loadTestSession(session.id, 'user-1');
    expect(record.questions).toHaveLength(session.questions.length);
    for (const q of record.questions) {
      expect(typeof q.correctAnswer).toBe('string');
      expect(q.correctAnswer.length).toBeGreaterThan(0);
    }
  });
});
