import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { WordRow } from './tests.service.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    word: { findMany: vi.fn() },
  },
}));

vi.mock('../../lib/redis.js', () => ({
  getRedis: () => ({ setex: vi.fn().mockResolvedValue('OK') }),
}));

import { generateTest } from './tests.service.js';
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
});
