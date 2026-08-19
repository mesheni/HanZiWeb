import { prisma } from '../../lib/prisma.js';
import { getTodayUtcRange } from '../stats/stats.service.js';
import type { AchievementType, UserAchievement } from '@hanzi/shared';

export const STREAK_7_TARGET = 7;
export const STREAK_30_TARGET = 30;
export const STREAK_100_TARGET = 100;
export const WORDS_100_TARGET = 100;
export const WORDS_500_TARGET = 500;
export const WORDS_1000_TARGET = 1000;
export const REVIEWS_1K_TARGET = 1_000;
export const REVIEWS_10K_TARGET = 10_000;
export const REVIEWS_50K_TARGET = 50_000;
export const SPEED_DEMON_MIN = 50;
export const PERFECT_5_TARGET = 5;
export const XP_1000_TARGET = 1_000;
export const XP_5000_TARGET = 5_000;
export const XP_10000_TARGET = 10_000;

const ALL_TYPES: readonly AchievementType[] = [
  'first_review',
  'streak_7',
  'streak_30',
  'streak_100',
  'words_100',
  'words_500',
  'words_1000',
  'hsk1_complete',
  'hsk2_complete',
  'hsk3_complete',
  'reviews_1k',
  'reviews_10k',
  'reviews_50k',
  'speed_demon',
  'early_bird',
  'night_owl',
  'perfect_session',
  'perfect_5',
  'xp_1000',
  'xp_5000',
  'xp_10000',
];

export function unlockedSet(unlocked: { type: string }[]): Set<string> {
  return new Set(unlocked.map((a) => a.type));
}

export async function getUserAchievements(userId: string): Promise<UserAchievement[]> {
  const rows = await prisma.userAchievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type as AchievementType,
    unlockedAt: r.unlockedAt.toISOString(),
  }));
}

export interface CheckableStats {
  currentStreak: number;
  learnedWords: number;
  totalReviews: number;
  hsk1Mastered: number;
  hsk1Total: number;
  hsk2Mastered: number;
  hsk2Total: number;
  hsk3Mastered: number;
  hsk3Total: number;
  perfectSessionCount: number;
  maxSessionAnswers: number;
  hasEarlySession: boolean;
  hasNightSession: boolean;
  xp: number;
}

export function pickGlobalUnlocks(stats: CheckableStats): AchievementType[] {
  const out: AchievementType[] = [];

  if (stats.totalReviews >= 1) out.push('first_review');

  if (stats.currentStreak >= STREAK_7_TARGET) out.push('streak_7');
  if (stats.currentStreak >= STREAK_30_TARGET) out.push('streak_30');
  if (stats.currentStreak >= STREAK_100_TARGET) out.push('streak_100');

  if (stats.learnedWords >= WORDS_100_TARGET) out.push('words_100');
  if (stats.learnedWords >= WORDS_500_TARGET) out.push('words_500');
  if (stats.learnedWords >= WORDS_1000_TARGET) out.push('words_1000');

  if (stats.totalReviews >= REVIEWS_1K_TARGET) out.push('reviews_1k');
  if (stats.totalReviews >= REVIEWS_10K_TARGET) out.push('reviews_10k');
  if (stats.totalReviews >= REVIEWS_50K_TARGET) out.push('reviews_50k');

  if (stats.hsk1Total > 0 && stats.hsk1Mastered >= stats.hsk1Total) out.push('hsk1_complete');
  if (stats.hsk2Total > 0 && stats.hsk2Mastered >= stats.hsk2Total) out.push('hsk2_complete');
  if (stats.hsk3Total > 0 && stats.hsk3Mastered >= stats.hsk3Total) out.push('hsk3_complete');

  if (stats.maxSessionAnswers >= SPEED_DEMON_MIN) out.push('speed_demon');

  if (stats.hasEarlySession) out.push('early_bird');
  if (stats.hasNightSession) out.push('night_owl');

  if (stats.perfectSessionCount >= PERFECT_5_TARGET) out.push('perfect_5');

  if (stats.xp >= XP_1000_TARGET) out.push('xp_1000');
  if (stats.xp >= XP_5000_TARGET) out.push('xp_5000');
  if (stats.xp >= XP_10000_TARGET) out.push('xp_10000');

  return out;
}

export async function gatherStats(userId: string): Promise<CheckableStats> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, xp: true, timezone: true },
  });

  // Окна early_bird/night_owl — в локальных часах пользователя (как
  // streaks/daily-goal), а не сервера: setHours брал таймзону процесса.
  const timezone = user?.timezone ?? 'UTC';
  const { start: localMidnight } = getTodayUtcRange(new Date(), timezone);
  const todayStart = localMidnight;
  const today8am = new Date(localMidnight.getTime() + 8 * 3_600_000);
  const tomorrow5am = new Date(localMidnight.getTime() + 29 * 3_600_000);

  const [
    progressCounts,
    totalReviews,
    hsk1Total,
    hsk1Mastered,
    hsk2Total,
    hsk2Mastered,
    hsk3Total,
    hsk3Mastered,
    perfectSessionCount,
    maxSessionRow,
    hasEarlySession,
    hasNightSession,
  ] = await Promise.all([
    prisma.userWordProgress.groupBy({ by: ['state'], where: { userId }, _count: true }),
    prisma.sessionAnswer.count({ where: { session: { userId } } }),
    prisma.word.count({ where: { hskLevel: 1 } }),
    prisma.userWordProgress.count({ where: { userId, state: 'graduated', word: { hskLevel: 1 } } }),
    prisma.word.count({ where: { hskLevel: 2 } }),
    prisma.userWordProgress.count({ where: { userId, state: 'graduated', word: { hskLevel: 2 } } }),
    prisma.word.count({ where: { hskLevel: 3 } }),
    prisma.userWordProgress.count({ where: { userId, state: 'graduated', word: { hskLevel: 3 } } }),
    prisma.userAchievement.count({ where: { userId, type: 'perfect_session' } }),
    prisma.sessionAnswer.groupBy({
      by: ['sessionId'],
      where: { session: { userId } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    }),
    prisma.session.findFirst({
      where: { userId, startedAt: { gte: todayStart, lt: today8am } },
      select: { id: true },
    }),
    prisma.session.findFirst({
      where: { userId, startedAt: { gte: todayStart, lt: tomorrow5am } },
      select: { id: true },
    }),
  ]);

  const stateMap: Record<string, number> = {};
  for (const row of progressCounts) {
    stateMap[row.state] = row._count;
  }

  return {
    currentStreak: user?.currentStreak ?? 0,
    learnedWords: (stateMap.graduated ?? 0) + (stateMap.review ?? 0),
    totalReviews,
    hsk1Mastered,
    hsk1Total,
    hsk2Mastered,
    hsk2Total,
    hsk3Mastered,
    hsk3Total,
    perfectSessionCount,
    maxSessionAnswers: maxSessionRow[0]?._count?.id ?? 0,
    hasEarlySession: hasEarlySession !== null,
    hasNightSession: hasNightSession !== null,
    xp: user?.xp ?? 0,
  };
}

export async function checkGlobalAchievements(userId: string): Promise<UserAchievement[]> {
  const [stats, existing] = await Promise.all([
    gatherStats(userId),
    prisma.userAchievement.findMany({ where: { userId } }),
  ]);

  const already = unlockedSet(existing);
  const candidates = pickGlobalUnlocks(stats).filter((t) => !already.has(t));

  if (candidates.length === 0) return [];

  const created = await prisma.$transaction(
    candidates.map((type) =>
      prisma.userAchievement.upsert({
        where: { userId_type: { userId, type } },
        create: { userId, type },
        update: {},
      }),
    ),
  );

  return created.map((r) => ({
    id: r.id,
    type: r.type as AchievementType,
    unlockedAt: r.unlockedAt.toISOString(),
  }));
}

export async function checkPerfectSession(
  userId: string,
  sessionId: string,
): Promise<UserAchievement | null> {
  const [answers, existing, session] = await Promise.all([
    prisma.sessionAnswer.findMany({
      where: { sessionId, session: { userId } },
      select: { rating: true },
    }),
    prisma.userAchievement.findUnique({
      where: { userId_type: { userId, type: 'perfect_session' } },
    }),
    prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { cardsTotal: true, cardsCompleted: true, startedAt: true },
    }),
  ]);

  if (existing) return null;
  if (!session || session.cardsTotal <= 0) return null;
  if (session.cardsCompleted < session.cardsTotal) return null;
  if (answers.length === 0) return null;
  const allEasy = answers.every((a) => a.rating === 4);
  if (!allEasy) return null;

  const created = await prisma.userAchievement.upsert({
    where: { userId_type: { userId, type: 'perfect_session' } },
    create: { userId, type: 'perfect_session' },
    update: {},
  });

  // Also check early_bird / night_owl based on session start time
  const hour = session.startedAt.getHours();
  if (hour < 8) {
    await tryUnlock(userId, 'early_bird');
  }
  if (hour < 5) {
    await tryUnlock(userId, 'night_owl');
  }

  return {
    id: created.id,
    type: 'perfect_session',
    unlockedAt: created.unlockedAt.toISOString(),
  };
}

export async function checkAllAchievements(
  userId: string,
  sessionId: string,
): Promise<UserAchievement[]> {
  const [global, perfect] = await Promise.all([
    checkGlobalAchievements(userId),
    checkPerfectSession(userId, sessionId),
  ]);
  const merged = [...global];
  if (perfect) merged.push(perfect);
  return merged;
}

async function tryUnlock(userId: string, type: string): Promise<UserAchievement | null> {
  const existing = await prisma.userAchievement.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (existing) return null;
  const created = await prisma.userAchievement.upsert({
    where: { userId_type: { userId, type } },
    create: { userId, type },
    update: {},
  });
  return { id: created.id, type: type as AchievementType, unlockedAt: created.unlockedAt.toISOString() };
}

export const ALL_ACHIEVEMENT_TYPES = ALL_TYPES;
