import { prisma } from '../../lib/prisma.js';

export async function getOverview(userId: string) {
  const [user, progressCounts, accuracy] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { xp: true } }),
    prisma.userWordProgress.groupBy({
      by: ['state'],
      where: { userId },
      _count: true,
    }),
    prisma.sessionAnswer.aggregate({
      where: { session: { userId } },
      _avg: { rating: true },
    }),
  ]);

  const stateMap: Record<string, number> = {};
  for (const row of progressCounts) {
    stateMap[row.state] = row._count;
  }

  const totalWords = Object.values(stateMap).reduce((a, b) => a + b, 0);
  const learnedWords = (stateMap.GRADUATED ?? 0) + (stateMap.REVIEW ?? 0);
  const avgRating = accuracy._avg.rating ?? 0;
  // Конвертируем средний рейтинг (1-4) в процент точности
  const accuracyPercent = avgRating > 0 ? Math.round((avgRating / 4) * 100) : 0;

  const { currentStreak } = await getUserStreak(userId);

  return {
    xp: user?.xp ?? 0,
    currentStreak,
    totalWords,
    learnedWords,
    accuracy: accuracyPercent,
    byState: {
      new: stateMap.NEW ?? 0,
      learning: stateMap.LEARNING ?? 0,
      review: stateMap.REVIEW ?? 0,
      graduated: stateMap.GRADUATED ?? 0,
    },
  };
}

export async function getDashboard(userId: string) {
  const [user, progressCounts, totalReviews] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true },
    }),
    prisma.userWordProgress.groupBy({
      by: ['state'],
      where: { userId },
      _count: true,
    }),
    prisma.sessionAnswer.count({
      where: { session: { userId } },
    }),
  ]);

  const stateMap: Record<string, number> = {};
  for (const row of progressCounts) {
    stateMap[row.state] = row._count;
  }

  const wordsLearned = (stateMap.GRADUATED ?? 0) + (stateMap.REVIEW ?? 0);
  const xp = user?.xp ?? 0;

  // Слова, которые нужно повторить сегодня (dueDate <= now, не graduated)
  const now = new Date();
  const wordsDueToday = await prisma.userWordProgress.count({
    where: {
      userId,
      dueDate: { lte: now },
      state: { notIn: ['graduated'] },
    },
  });

  const { currentStreak } = await getUserStreak(userId);

  return {
    streak: currentStreak,
    wordsDueToday,
    wordsLearned,
    totalReviews,
    xp,
  };
}

export async function getActivityData(userId: string, year: number, month?: number) {
  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = month
    ? new Date(Date.UTC(year, month, 0, 23, 59, 59))
    : new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const answers = await prisma.sessionAnswer.findMany({
    where: {
      session: { userId },
      answeredAt: { gte: startDate, lte: endDate },
    },
    select: { answeredAt: true },
  });

  // Группируем по дням
  const activityMap = new Map<string, number>();
  for (const a of answers) {
    const date = a.answeredAt.toISOString().slice(0, 10);
    activityMap.set(date, (activityMap.get(date) ?? 0) + 1);
  }

  return Array.from(activityMap.entries()).map(([date, count]) => ({
    date,
    count,
  }));
}

/**
 * Computes and updates the user's daily streak based on lastActiveDate.
 * Called every time the user is active today (e.g. visits the app).
 *
 * Logic:
 * - lastActiveDate is null (never active)      → streak = 1, set lastActiveDate = today
 * - today === lastActiveDate (already counted)  → streak unchanged, no DB update
 * - today === lastActiveDate + 1 (consecutive)  → streak = currentStreak + 1
 * - gap > 1 day (streak broken)                 → streak = 1 (new streak)
 */
export async function getUserStreak(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, lastActiveDate: true },
  });

  const currentStreak = user?.currentStreak ?? 0;
  const rawLastActive = user?.lastActiveDate ?? null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let newStreak = currentStreak;
  let lastActiveDay: Date | null = rawLastActive ? new Date(rawLastActive) : null;
  if (lastActiveDay) lastActiveDay.setUTCHours(0, 0, 0, 0);

  const MS_PER_DAY = 86_400_000;

  if (!lastActiveDay) {
    // Never active before — start streak at 1
    newStreak = 1;
  } else {
    const diffDays = Math.floor((today.getTime() - lastActiveDay.getTime()) / MS_PER_DAY);

    if (diffDays === 0) {
      // Already counted today — no change, no update
      return { currentStreak: newStreak, lastActiveDate: rawLastActive };
    } else if (diffDays === 1) {
      // Consecutive day — increment streak
      newStreak = currentStreak + 1;
    } else {
      // Gap > 1 day — streak broken, start new one
      newStreak = 1;
    }
  }

  // Persist the updated streak and lastActiveDate
  await prisma.user.update({
    where: { id: userId },
    data: {
      currentStreak: newStreak,
      lastActiveDate: today,
    },
  });

  return { currentStreak: newStreak, lastActiveDate: today.toISOString() };
}
