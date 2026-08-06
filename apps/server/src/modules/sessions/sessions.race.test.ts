import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { recordAnswer } from './sessions.service.js';
import { recalcFsrs } from './srs.js';

// Конкурентные ответы на одно слово (PLANCorrection #17): до фикса
// recordAnswer читал прогресс ДО транзакции — два параллельных ответа
// оба считали FSRS от старой stability/difficulty и затирали друг друга
// (потерянное обновление: reps +2, stability — от устаревшего состояния).
// После фикса проигравший получает count === 0 от optimistic-update,
// перечитывает строку и пересчитывает FSRS — финальное состояние
// эквивалентно последовательному применению обоих ответов.

const testRunId = Date.now();
let userId = '';
let wordId = '';
let session1 = '';
let session2 = '';

async function createUser(): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `race-${testRunId}-${Math.random().toString(36).slice(2, 6)}@hanzi.local` },
  });
  return u.id;
}

async function createWord(): Promise<string> {
  const w = await prisma.word.create({
    data: {
      character: `竞${testRunId}-${Math.random().toString(36).slice(2, 6)}`,
      pinyin: 'jìng',
      translation: 'race',
    },
  });
  return w.id;
}

async function createSession(uid: string): Promise<string> {
  const s = await prisma.session.create({
    data: { userId: uid, cardsTotal: 1, mode: 'mixed', practiceType: 'flip-card' },
  });
  return s.id;
}

describe('recordAnswer — concurrent answers serialize without lost update (PLANCorrection #17)', () => {
  beforeAll(async () => {
    userId = await createUser();
    wordId = await createWord();
    session1 = await createSession(userId);
    session2 = await createSession(userId);
    // Карточка «review» с известным состоянием: два ответа Good с одним
    // и тем же answeredAt дают детерминированный последовательный
    // результат независимо от того, кто выиграет гонку.
    await prisma.userWordProgress.create({
      data: {
        userId,
        wordId,
        state: 'review',
        stability: 5,
        difficulty: 5,
        reps: 1,
        dueDate: new Date(),
        lastReviewDate: new Date('2026-07-14T12:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
  });

  it('два параллельных recordAnswer: финальное состояние = последовательное применение двух оценок', async () => {
    const answeredAt = new Date('2026-07-15T12:00:00.000Z');

    // Последовательный эталон: первый ответ — elapsed ровно 1 день,
    // второй — elapsed 0 (answeredAt совпадает) → R = 1.
    const first = recalcFsrs(3, 5, 5, 'review', 1);
    const second = recalcFsrs(3, first.newStability, first.newDifficulty, first.newState, 0);

    const [r1, r2] = await Promise.all([
      recordAnswer(userId, {
        sessionId: session1,
        wordId,
        rating: 3,
        answeredAt: answeredAt.toISOString(),
      }),
      recordAnswer(userId, {
        sessionId: session2,
        wordId,
        rating: 3,
        answeredAt: answeredAt.toISOString(),
      }),
    ]);

    // Оба ответа приняты и награждены.
    expect(r1.xpGain).toBe(3);
    expect(r2.xpGain).toBe(3);

    // reps = 1 + 2, stability/difficulty/state — как при последовательном
    // применении (до фикса stability была бы first.newStability — потерянное
    // обновление).
    const progress = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });
    expect(progress?.reps).toBe(3);
    expect(progress?.stability).toBe(second.newStability);
    expect(progress?.difficulty).toBe(second.newDifficulty);
    expect(progress?.state).toBe(second.newState);
    expect(progress?.lastReviewDate?.toISOString()).toBe(answeredAt.toISOString());

    // Каждый ответ попал в свою сессию ровно один раз.
    const [s1, s2] = await Promise.all([
      prisma.session.findUnique({ where: { id: session1 } }),
      prisma.session.findUnique({ where: { id: session2 } }),
    ]);
    expect(s1?.cardsCompleted).toBe(1);
    expect(s2?.cardsCompleted).toBe(1);
    const answers1 = await prisma.sessionAnswer.findMany({ where: { sessionId: session1, wordId } });
    const answers2 = await prisma.sessionAnswer.findMany({ where: { sessionId: session2, wordId } });
    expect(answers1).toHaveLength(1);
    expect(answers2).toHaveLength(1);
  });
});
