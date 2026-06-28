import { prisma } from '../../lib/prisma.js';

export async function getOverview(userId: string) {
  const [user, progressCounts, accuracy] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { xp: true, currentStreak: true } }),
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

  return {
    xp: user?.xp ?? 0,
    currentStreak: user?.currentStreak ?? 0,
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

export async function getActivityData(userId: string, year: number, month: number) {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const answers = await prisma.sessionAnswer.findMany({
    where: {
      session: { userId },
      answeredAt: { gte: startDate, lte: endDate },
    },
    select: { answeredAt: true },
  });

  // Группируем по дням
  const activityMap = new Map<number, number>();
  for (const a of answers) {
    const day = a.answeredAt.getUTCDate();
    activityMap.set(day, (activityMap.get(day) ?? 0) + 1);
  }

  return Array.from(activityMap.entries()).map(([day, count]) => ({
    day,
    count,
  }));
}
