import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { recordAnswer } from './sessions.service.js';

const testRunId = Date.now();
let userId = '';
let wordId = '';
let sessionId = '';

async function createUser(): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `tx-${testRunId}-${Math.random().toString(36).slice(2, 6)}@hanzi.local` },
  });
  return u.id;
}

async function createWord(): Promise<string> {
  const w = await prisma.word.create({
    data: {
      character: `顺${testRunId}-${Math.random().toString(36).slice(2, 6)}`,
      pinyin: 'shùn',
      translation: 'smooth',
    },
  });
  return w.id;
}

async function createSession(userId: string): Promise<string> {
  const s = await prisma.session.create({
    data: { userId, cardsTotal: 1, mode: 'mixed', practiceType: 'flip-card' },
  });
  return s.id;
}

async function createProgress(userId: string, wordId: string): Promise<void> {
  await prisma.userWordProgress.create({
    data: { userId, wordId, state: 'new', dueDate: new Date() },
  });
}

type MockTx = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  userWordProgress: {
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  sessionAnswer: { create: ReturnType<typeof vi.fn> };
  session: { update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  syncJournal: { create: ReturnType<typeof vi.fn> };
};

/** Стаб строки прогресса, который читает recordAnswer внутри tx. */
function progressStub() {
  return {
    stability: 5,
    difficulty: 5,
    state: 'review',
    reps: 1,
    dueDate: new Date(),
    lastReviewDate: new Date(Date.now() - 86_400_000),
  };
}

function runWithMockTransaction(txMock: MockTx): { restore: () => void } {
  const txSpy = vi.spyOn(prisma, '$transaction');
  txSpy.mockImplementation(((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: MockTx) => Promise<unknown>)(txMock);
    }
    throw new Error('array form not used by recordAnswer');
  }) as typeof prisma.$transaction);
  return { restore: () => txSpy.mockRestore() };
}

describe('recordAnswer — atomicity (PLAN_Features_v0.4 §26)', () => {
  beforeAll(async () => {
    userId = await createUser();
    wordId = await createWord();
    sessionId = await createSession(userId);
    await createProgress(userId, wordId);
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
  });

  it('happy path: все мутирующие операции идут через tx (не prisma), XP — вне tx', async () => {
    // txMock намеренно НЕ содержит `user.update`. Если recordAnswer
    // вызовет tx.user.update, получит TypeError и тест упадёт. Это
    // структурное доказательство, что XP остался вне $transaction.
    // `user.updateMany` (стрик, F12) при этом присутствует — стрик
    // персистится атомарно с ответом через tx, а не через prisma.
    const txMock: MockTx = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ currentStreak: 0, lastActiveDate: null, timezone: 'UTC' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userWordProgress: {
        findUnique: vi.fn().mockResolvedValue(progressStub()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      sessionAnswer: { create: vi.fn().mockResolvedValue({}) },
      session: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      // F32: журнал изменений пишется в той же транзакции, что и ответ.
      syncJournal: { create: vi.fn().mockResolvedValue({}) },
    };
    const { restore } = runWithMockTransaction(txMock);

    // Достижения тоже мокаем, чтобы тест не зависел от их реализации.
    const achMod = await import('../achievements/achievements.service.js');
    const achSpy = vi.spyOn(achMod, 'checkAllAchievements').mockResolvedValue([] as never);

    try {
      await recordAnswer(userId, { sessionId, wordId, rating: 3 });
    } finally {
      achSpy.mockRestore();
      restore();
    }

    expect(txMock.userWordProgress.findUnique).toHaveBeenCalledTimes(1);
    expect(txMock.userWordProgress.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.sessionAnswer.create).toHaveBeenCalledTimes(1);
    expect(txMock.session.update).toHaveBeenCalledTimes(1);
    expect(txMock.session.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(txMock.user.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.syncJournal.create).toHaveBeenCalledTimes(1);
  });

  it('mid-transaction failure: only first two ops run in tx, no DB change, XP is not granted', async () => {
    // Шаги:
    //   1) tx.userWordProgress.findUnique + updateMany  ✓
    //   2) tx.sessionAnswer.create                      ✗ (mock throws)
    //   3) tx.session.update                            — не выполняется (после throw)
    //   4) prisma.user.update (XP)                      — не выполняется (после throw)
    // Mock-tx не пишет в реальный Postgres, так что и так ничего бы не
    // записалось. Дополнительно проверяем реальное состояние DB.
    const txMock: MockTx = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ currentStreak: 0, lastActiveDate: null, timezone: 'UTC' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userWordProgress: {
        findUnique: vi.fn().mockResolvedValue(progressStub()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      sessionAnswer: {
        create: vi.fn().mockRejectedValue(new Error('forced mid-tx failure')),
      },
      session: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      // F32: журнал изменений — тоже не должен выполняться после throw.
      syncJournal: { create: vi.fn().mockResolvedValue({}) },
    };
    const { restore } = runWithMockTransaction(txMock);

    const xpBefore = (await prisma.user.findUnique({ where: { id: userId } }))?.xp ?? 0;
    const sessionBefore = await prisma.session.findUnique({ where: { id: sessionId } });
    const cardsBefore = sessionBefore?.cardsCompleted ?? 0;
    const progressBefore = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });
    const repsBefore = progressBefore?.reps ?? 0;

    try {
      await expect(recordAnswer(userId, { sessionId, wordId, rating: 3 })).rejects.toThrow(
        'forced mid-tx failure',
      );
    } finally {
      restore();
    }

    // Внутри tx-колбэка успели выполниться 1) и 2), 2-й упал.
    expect(txMock.userWordProgress.findUnique).toHaveBeenCalledTimes(1);
    expect(txMock.userWordProgress.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.sessionAnswer.create).toHaveBeenCalledTimes(1);
    // 3) не выполнился — мы упали на шаге 2.
    expect(txMock.session.update).not.toHaveBeenCalled();

    // Реальное DB-состояние не изменилось.
    const xpAfter = (await prisma.user.findUnique({ where: { id: userId } }))?.xp ?? 0;
    const sessionAfter = await prisma.session.findUnique({ where: { id: sessionId } });
    const progressAfter = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });
    expect(xpAfter).toBe(xpBefore);
    expect(sessionAfter?.cardsCompleted).toBe(cardsBefore);
    expect(progressAfter?.reps).toBe(repsBefore);
  });

  it('end-to-end happy path: real $transaction advances DB consistently', async () => {
    // Регрессия: если кто-то вернёт «раздельные await» вместо
    // $transaction, эта проверка упадёт на неконсистентности только
    // в редких гонках. Структурный тест выше ловит регрессию формы,
    // этот — happy-path с реальной Postgres-транзакцией.
    const progressBefore = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });
    const sessionBefore = await prisma.session.findUnique({ where: { id: sessionId } });
    const userBefore = await prisma.user.findUnique({ where: { id: userId } });
    const repsBefore = progressBefore?.reps ?? 0;
    const cardsBefore = sessionBefore?.cardsCompleted ?? 0;
    const xpBefore = userBefore?.xp ?? 0;

    const result = await recordAnswer(userId, { sessionId, wordId, rating: 3 });
    expect(result.xpGain).toBe(3);

    const progressAfter = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });
    const sessionAfter = await prisma.session.findUnique({ where: { id: sessionId } });
    const userAfter = await prisma.user.findUnique({ where: { id: userId } });
    expect(progressAfter?.reps).toBe(repsBefore + 1);
    expect(sessionAfter?.cardsCompleted).toBe(cardsBefore + 1);
    expect(userAfter?.xp).toBe(xpBefore + 3);
  });

  it('Postgres-level sanity: a forced throw inside $transaction rolls back prior writes', async () => {
    // Sanity-проверка инварианта Postgres + Prisma, на котором стоит §26.
    // Создадим временную «сессию», чтобы не задеть общую.
    const tempSessionId = await createSession(userId);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.session.update({
          where: { id: tempSessionId },
          data: { cardsCompleted: 1 },
        });
        throw new Error('forced');
      });
    } catch {
      // ожидаемо
    }
    const after = await prisma.session.findUnique({ where: { id: tempSessionId } });
    expect(after?.cardsCompleted).toBe(0);
  });
});
