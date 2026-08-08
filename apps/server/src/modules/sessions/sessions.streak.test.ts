import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { recordAnswer } from './sessions.service.js';
import * as achievementsService from '../achievements/achievements.service.js';
import { getLocalDayKey } from '../stats/stats.service.js';

// F12 (plan-features-v0-6-ru): асимметрия live/offline стрика. Live-ответы
// (recordAnswer) обязаны обновлять lastActiveDate + currentStreak так же,
// как офлайн-flush (sync-путь), — а не только просмотр дашборда.

const testRunId = Date.now();
let userId = '';

async function createWord(): Promise<string> {
  return (
    await prisma.word.create({
      data: {
        character: `永${testRunId}-${Math.random().toString(36).slice(2, 6)}`,
        pinyin: 'yǒng',
        translation: 'f12',
      },
    })
  ).id;
}

async function createSession(practiceType: string): Promise<string> {
  return (
    await prisma.session.create({
      data: { userId, cardsTotal: 1, mode: 'mixed', practiceType },
    })
  ).id;
}

async function createProgress(wordId: string): Promise<void> {
  await prisma.userWordProgress.create({
    data: {
      userId,
      wordId,
      state: 'review',
      stability: 5,
      difficulty: 5,
      reps: 1,
      dueDate: new Date(),
      lastReviewDate: new Date(Date.now() - 86_400_000),
    },
  });
}

async function seedStreak(currentStreak: number, lastActiveDate: Date | null): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { currentStreak, lastActiveDate },
  });
}

describe('recordAnswer — live-ответы обновляют стрик (F12)', () => {
  beforeAll(async () => {
    // Достижения не в фокусе теста — отключаем, чтобы не плодить строки.
    vi.spyOn(achievementsService, 'checkAllAchievements').mockResolvedValue([] as never);
    userId = (
      await prisma.user.create({ data: { email: `f12-${testRunId}@hanzi.local`, timezone: 'UTC' } })
    ).id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.userWordProgress.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.word.deleteMany({
      where: { character: { startsWith: `永${testRunId}` } },
    });
  });

  it('consecutive-день: ответ увеличивает currentStreak и ставит lastActiveDate = сегодня', async () => {
    const wid = await createWord();
    const sid = await createSession('flip-card');
    await createProgress(wid);
    await seedStreak(5, new Date(Date.now() - 86_400_000));

    try {
      await recordAnswer(userId, { sessionId: sid, wordId: wid, rating: 3 });

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.currentStreak).toBe(6);
      expect(getLocalDayKey(user!.lastActiveDate!, 'UTC')).toBe(getLocalDayKey(new Date(), 'UTC'));
    } finally {
      await prisma.session.deleteMany({ where: { id: sid } });
      await prisma.userWordProgress.deleteMany({ where: { userId, wordId: wid } });
      await prisma.word.deleteMany({ where: { id: wid } });
    }
  });

  it('повторная активность в тот же день не накручивает стрик (уже засчитан)', async () => {
    const wid = await createWord();
    const sid = await createSession('flip-card');
    await createProgress(wid);
    await seedStreak(6, new Date());

    try {
      await recordAnswer(userId, { sessionId: sid, wordId: wid, rating: 4 });

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.currentStreak).toBe(6);
      expect(getLocalDayKey(user!.lastActiveDate!, 'UTC')).toBe(getLocalDayKey(new Date(), 'UTC'));
    } finally {
      await prisma.session.deleteMany({ where: { id: sid } });
      await prisma.userWordProgress.deleteMany({ where: { userId, wordId: wid } });
      await prisma.word.deleteMany({ where: { id: wid } });
    }
  });

  it('тренировочный режим (multiple-choice) тоже засчитывает активность', async () => {
    const wid = await createWord();
    const sid = await createSession('multiple-choice');
    await createProgress(wid);
    await seedStreak(6, new Date(Date.now() - 86_400_000));

    try {
      await recordAnswer(userId, { sessionId: sid, wordId: wid, rating: 4 });

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.currentStreak).toBe(7);
      expect(getLocalDayKey(user!.lastActiveDate!, 'UTC')).toBe(getLocalDayKey(new Date(), 'UTC'));
    } finally {
      await prisma.session.deleteMany({ where: { id: sid } });
      await prisma.userWordProgress.deleteMany({ where: { userId, wordId: wid } });
      await prisma.word.deleteMany({ where: { id: wid } });
    }
  });
});
