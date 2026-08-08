import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { recordAnswer } from '../sessions/sessions.service.js';
import { processSync } from './sync.service.js';
import type { SyncRequest } from '@hanzi/shared';

/**
 * Регрессия F04 (plan-features-v0-6-ru): клиентские таймстемпы больше
 * не доверяются для lastReviewDate/стрика/FSRS — сервер — источник
 * истины. Клиентское время разрешено только для офлайн-elapsed с
 * серверной границей.
 */

const testRunId = Date.now();
const nowToleranceMs = 60_000;

let userId = '';
let deckId = '';
const words: Record<string, string> = {};
let sessionLive = '';
let sessionSync = '';

async function createWord(key: string, char: string): Promise<void> {
  words[key] = (
    await prisma.word.create({
      data: { character: `${char}${testRunId}`, pinyin: 'f04', translation: 'f04' },
    })
  ).id;
  await prisma.deckWord.create({ data: { deckId, wordId: words[key]! } });
  await prisma.userWordProgress.create({
    data: {
      userId,
      wordId: words[key]!,
      state: 'new',
      stability: 0,
      difficulty: 5,
      reps: 0,
      dueDate: new Date(),
    },
  });
}

async function createSession(cardsTotal: number): Promise<string> {
  return (
    await prisma.session.create({
      data: { userId, deckId, cardsTotal, mode: 'mixed', practiceType: 'flip-card' },
    })
  ).id;
}

async function lastReview(wordKey: string) {
  return (
    await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId: words[wordKey]! } },
      select: { lastReviewDate: true, reps: true },
    })
  )!;
}

function syncRequest(wordKey: string, timestamp: string, idSuffix: string): SyncRequest {
  return {
    changes: [
      {
        id: `ch-${idSuffix}`,
        type: 'study_answer',
        payload: { wordId: words[wordKey]!, rating: 4, timestamp, sessionId: sessionSync },
      },
    ],
  };
}

describe('F04 — серверный источник истины для таймстемпов', () => {
  beforeAll(async () => {
    userId = (
      await prisma.user.create({ data: { email: `f04-${testRunId}@hanzi.local` } })
    ).id;
    deckId = (
      await prisma.deck.create({
        data: { name: `F04 deck ${testRunId}`, isSystemDeck: false, ownerId: userId },
      })
    ).id;

    // live-путь
    await createWord('liveFuture', '甲');
    await createWord('liveAncient', '乙');
    sessionLive = await createSession(2);

    // sync-путь
    await createWord('syncFuture', '丙');
    await createWord('syncAncient', '丁');
    await createWord('syncOffline', '戊');
    sessionSync = await createSession(3);
  });

  afterAll(async () => {
    await prisma.deck.deleteMany({ where: { id: deckId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.word.deleteMany({
      where: { id: { in: Object.values(words) } },
    });
  });

  // ─── Live-путь: recordAnswer ─────────────────────────────────────

  it('answeredAt в будущем не попадает в lastReviewDate (≈ серверное сейчас)', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await recordAnswer(userId, {
      sessionId: sessionLive,
      wordId: words.liveFuture!,
      rating: 4,
      answeredAt: future,
    });
    const p = await lastReview('liveFuture');
    expect(Math.abs(p.lastReviewDate!.getTime() - Date.now())).toBeLessThan(nowToleranceMs);
    expect(p.lastReviewDate!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('answeredAt в далёком прошлом не попадает в lastReviewDate (≈ серверное сейчас)', async () => {
    const ancient = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString();
    await recordAnswer(userId, {
      sessionId: sessionLive,
      wordId: words.liveAncient!,
      rating: 4,
      answeredAt: ancient,
    });
    const p = await lastReview('liveAncient');
    expect(Math.abs(p.lastReviewDate!.getTime() - Date.now())).toBeLessThan(nowToleranceMs);
  });

  it('SessionAnswer.answeredAt — серверное время, а не клиентское', async () => {
    const answers = await prisma.sessionAnswer.findMany({ where: { sessionId: sessionLive } });
    expect(answers.length).toBe(2);
    for (const a of answers) {
      expect(Math.abs(a.answeredAt.getTime() - Date.now())).toBeLessThan(nowToleranceMs);
    }
  });

  // ─── Sync-путь: processSync ──────────────────────────────────────

  it('sync с будущим timestamp → ответ применяется, lastReviewDate ≈ серверное сейчас', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const res = await processSync(userId, syncRequest('syncFuture', future, 'future'));
    expect(res.results).toHaveLength(1);
    const p = await lastReview('syncFuture');
    expect(Math.abs(p.lastReviewDate!.getTime() - Date.now())).toBeLessThan(nowToleranceMs);
    expect(p.reps).toBe(1);
  });

  it('sync с древним timestamp → lastReviewDate ≈ серверное сейчас (не древний)', async () => {
    const ancient = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString();
    const res = await processSync(userId, syncRequest('syncAncient', ancient, 'ancient'));
    expect(res.results).toHaveLength(1);
    const p = await lastReview('syncAncient');
    expect(Math.abs(p.lastReviewDate!.getTime() - Date.now())).toBeLessThan(nowToleranceMs);
  });

  it('sync с легитимным офлайн-timestamp (вчера) → применяется, lastReviewDate серверный', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const res = await processSync(userId, syncRequest('syncOffline', yesterday, 'offline'));
    expect(res.results).toHaveLength(1);
    const p = await lastReview('syncOffline');
    expect(p.reps).toBe(1);
    expect(Math.abs(p.lastReviewDate!.getTime() - Date.now())).toBeLessThan(nowToleranceMs);
  });

  it('sync-ответ, уже применённый live-путём, не применяется дважды (reps не растёт)', async () => {
    const before = await lastReview('liveFuture');
    const stale = new Date(Date.now() - 5000).toISOString();
    const res = await processSync(userId, {
      changes: [
        {
          id: 'ch-dup',
          type: 'study_answer',
          payload: { wordId: words.liveFuture!, rating: 4, timestamp: stale, sessionId: sessionLive },
        },
      ],
    });
    // Пропущен либо по времени (changeTime <= lastReviewDate), либо по
    // SessionAnswer-guard — повторного применения нет.
    expect(res.results).toHaveLength(0);
    const p = await lastReview('liveFuture');
    expect(p.reps).toBe(before.reps);
  });
});
