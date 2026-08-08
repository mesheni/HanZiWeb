import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { recordAnswer } from './sessions.service.js';
import { checkPerfectSession } from '../achievements/achievements.service.js';
import type { RecordAnswer } from '@hanzi/shared';

/**
 * Регрессия F03 (plan-features-v0-6-ru): целостность сессий.
 * 1. Сессии принимали ответы на слова НЕ из колоды (membership).
 * 2. completedAt никогда не выставлялся.
 * 3. perfect_session разблокировался без полного завершения сессии.
 */

const testRunId = Date.now();

interface Fixture {
  userId: string;
  deckId: string;
  wordA: string; // в колоде
  wordB: string; // в колоде
  wordC: string; // НЕ в колоде
  sessionId: string;
}

let fixture: Fixture;
const extraUsers: string[] = [];

async function createFixture(cardsTotal: number): Promise<Fixture> {
  const user = await prisma.user.create({
    data: { email: `f03-${testRunId}-${Math.random()}@hanzi.local` },
  });
  const deck = await prisma.deck.create({
    data: { name: `F03 deck ${testRunId}`, isSystemDeck: false, ownerId: user.id },
  });
  const makeWord = async (tag: string) =>
    (
      await prisma.word.create({
        data: { character: `${tag}${testRunId}`, pinyin: 'f03', translation: 'f03' },
      })
    ).id;
  const wordA = await makeWord('甲');
  const wordB = await makeWord('乙');
  const wordC = await makeWord('丙');

  await prisma.deckWord.createMany({
    data: [
      { deckId: deck.id, wordId: wordA },
      { deckId: deck.id, wordId: wordB },
    ],
  });

  const now = new Date();
  await prisma.userWordProgress.createMany({
    data: [wordA, wordB, wordC].map((wordId) => ({
      userId: user.id,
      wordId,
      state: 'new' as const,
      stability: 0,
      difficulty: 5,
      reps: 0,
      dueDate: now,
    })),
  });

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      deckId: deck.id,
      cardsTotal,
      mode: 'mixed',
      practiceType: 'flip-card',
    },
  });

  extraUsers.push(user.id);
  return { userId: user.id, deckId: deck.id, wordA, wordB, wordC, sessionId: session.id };
}

const answer = (sessionId: string, wordId: string, rating: 1 | 2 | 3 | 4): RecordAnswer => ({
  sessionId,
  wordId,
  rating,
});

async function readSession(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    select: { cardsCompleted: true, cardsTotal: true, completedAt: true },
  });
}

describe('F03 — целостность сессий', () => {
  beforeAll(async () => {
    fixture = await createFixture(2);
  });

  afterAll(async () => {
    await prisma.deck.deleteMany({ where: { id: fixture.deckId } });
    await prisma.user.deleteMany({ where: { id: { in: [fixture.userId, ...extraUsers] } } });
    await prisma.word.deleteMany({ where: { id: { in: [fixture.wordA, fixture.wordB, fixture.wordC] } } });
  });

  // ─── Звено 1: membership (ответы только на слова колоды) ─────────

  it('ответ на слово НЕ из колоды → 400 WORD_NOT_IN_DECK', async () => {
    let caught: { statusCode?: number; code?: string } | null = null;
    try {
      await recordAnswer(fixture.userId, answer(fixture.sessionId, fixture.wordC, 4));
    } catch (e) {
      caught = e as { statusCode?: number; code?: string };
    }
    expect(caught).not.toBeNull();
    expect(caught?.statusCode).toBe(400);
    expect(caught?.code).toBe('WORD_NOT_IN_DECK');
  });

  it('отклонённый ответ не пишет SessionAnswer, не двигает счётчик и прогресс', async () => {
    const s = await readSession(fixture.sessionId);
    expect(s?.cardsCompleted).toBe(0);

    const answers = await prisma.sessionAnswer.count({ where: { sessionId: fixture.sessionId } });
    expect(answers).toBe(0);

    const progress = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId: fixture.userId, wordId: fixture.wordC } },
      select: { lastReviewDate: true, reps: true },
    });
    expect(progress?.reps).toBe(0);
    expect(progress?.lastReviewDate).toBeNull();
  });

  it('ответ на слово ИЗ колоды принимается', async () => {
    const result = await recordAnswer(fixture.userId, answer(fixture.sessionId, fixture.wordA, 4));
    expect(result.wordId).toBe(fixture.wordA);
    const s = await readSession(fixture.sessionId);
    expect(s?.cardsCompleted).toBe(1);
  });

  // ─── Звено 2: completedAt ────────────────────────────────────────

  it('после первого ответа (1/2) completedAt ещё null', async () => {
    const s = await readSession(fixture.sessionId);
    expect(s?.cardsCompleted).toBe(1);
    expect(s?.completedAt).toBeNull();
  });

  it('после последнего ответа (2/2) completedAt проставлен', async () => {
    await recordAnswer(fixture.userId, answer(fixture.sessionId, fixture.wordB, 4));
    const s = await readSession(fixture.sessionId);
    expect(s?.cardsCompleted).toBe(2);
    expect(s?.completedAt).not.toBeNull();
  });

  // ─── Звено 3: perfect_session только за завершённую сессию ───────

  it('незавершённая сессия (1/2 ответов Easy) → perfect_session НЕ разблокируется', async () => {
    const f = await createFixture(2);
    await recordAnswer(f.userId, answer(f.sessionId, f.wordA, 4));
    const a = await checkPerfectSession(f.userId, f.sessionId);
    expect(a).toBeNull();
  });

  it('завершённая сессия со всеми Easy → perfect_session разблокируется', async () => {
    const f = await createFixture(2);
    await recordAnswer(f.userId, answer(f.sessionId, f.wordA, 4));
    await recordAnswer(f.userId, answer(f.sessionId, f.wordB, 4));
    // recordAnswer сам проверяет достижения после каждого ответа —
    // проверяем факт разблокировки в БД.
    const unlocked = await prisma.userAchievement.findUnique({
      where: { userId_type: { userId: f.userId, type: 'perfect_session' } },
    });
    expect(unlocked).not.toBeNull();
  });

  it('завершённая сессия с не-Easy ответом → perfect_session НЕ разблокируется', async () => {
    const f = await createFixture(2);
    await recordAnswer(f.userId, answer(f.sessionId, f.wordA, 4));
    await recordAnswer(f.userId, answer(f.sessionId, f.wordB, 3));
    const a = await checkPerfectSession(f.userId, f.sessionId);
    expect(a).toBeNull();
  });
});
