import { prisma } from '../../lib/prisma.js';
import { DAILY_GOAL_DEFAULT } from '@hanzi/shared';
import type { LeaderboardEntry, LeaderboardResponse } from '@hanzi/shared';

/** Карта «rating → XP». Должна совпадать с sessions.service.recordAnswer. */
export const RATING_XP: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 5 };

/** Начало текущей ISO-недели (Пн 00:00:00 UTC) и конец (exclusive). */
export function getCurrentWeekWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  // getUTCDay: 0=Вс, 1=Пн, ..., 6=Сб. Приводим к 0..6 где 0=Пн.
  const dow = (start.getUTCDay() + 6) % 7;
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - dow);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

/** Маскирует email в короткое публичное имя: "alice@gmail.com" → "al***@gmail.com". */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@', 2);
  if (!local || !domain) return '***';
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

/**
 * Считает суммарный XP за неделю по пользователю из плоского списка
 * ответов. Чистая функция — используется в `getLeaderboard` и
 * покрыта юнит-тестами.
 */
export function aggregateWeeklyXp(
  answers: Array<{ rating: number; userId: string }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of answers) {
    const gain = RATING_XP[a.rating] ?? 0;
    if (gain === 0) continue;
    out.set(a.userId, (out.get(a.userId) ?? 0) + gain);
  }
  return out;
}

/**
 * Считает ранг текущего пользователя в `xpByUser` (1-based).
 * Тот, у кого строго больше XP — обходит. При равном XP — оба делят
 * место; мы возвращаем позицию «после всех с большим XP», что даёт
 * стабильный порядок в плотных топах.
 */
export function computeRank(myXp: number, xpByUser: Map<string, number>): number {
  let better = 0;
  for (const xp of xpByUser.values()) {
    if (xp > myXp) better += 1;
  }
  return better + 1;
}

/**
 * Возвращает лидерборд за период (`week` | `all`).
 *
 * - `all`  — топ-100 пользователей по `User.xp` (использует индекс
 *   `User_xp_idx`).
 * - `week` — топ-100 пользователей по XP, заработанному за текущую
 *   календарную неделю (Пн–Вс, UTC), агрегированному из
 *   `SessionAnswer.answeredAt` + `rating`.
 *
 * Текущий пользователь помечается `isCurrentUser: true` и в
 * `currentUser` отдельной записью, если не вошёл в топ.
 */
export async function getLeaderboard(
  userId: string,
  period: 'week' | 'all',
  limit: number = 100,
): Promise<LeaderboardResponse> {
  // ── 1. Сбор XP за выбранный период ─────────────────────────────
  const weekWindow = period === 'week' ? getCurrentWeekWindow() : null;
  let xpByUser: Map<string, number> = new Map();
  if (weekWindow) {
    const weekAnswers = await prisma.sessionAnswer.findMany({
      where: { answeredAt: { gte: weekWindow.start, lt: weekWindow.end } },
      select: { rating: true, session: { select: { userId: true } } },
    });
    xpByUser = aggregateWeeklyXp(
      weekAnswers.map((a) => ({ rating: a.rating, userId: a.session.userId })),
    );
  }

  // ── 2. Топ-N по XP ────────────────────────────────────────────
  let topRows: Array<{ userId: string; xp: number; email: string; currentStreak: number }>;

  if (period === 'all') {
    const rows = await prisma.user.findMany({
      orderBy: { xp: 'desc' },
      take: limit,
      select: { id: true, xp: true, email: true, currentStreak: true },
    });
    topRows = rows.map((r) => ({
      userId: r.id,
      xp: r.xp,
      email: r.email,
      currentStreak: r.currentStreak,
    }));
  } else {
    const topUserIds = Array.from(xpByUser.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([uid]) => uid);
    if (topUserIds.length === 0) {
      topRows = [];
    } else {
      const users = await prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: { id: true, xp: true, email: true, currentStreak: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      topRows = topUserIds
        .map((uid) => userMap.get(uid))
        .filter((u): u is NonNullable<typeof u> => u != null)
        .map((u) => ({
          userId: u.id,
          xp: xpByUser.get(u.id) ?? 0,
          email: u.email,
          currentStreak: u.currentStreak,
        }));
    }
  }

  // ── 3. Запись текущего пользователя (если не в топе) ───────────
  const inTopIds = new Set(topRows.map((r) => r.userId));
  let currentUserEntry: LeaderboardEntry | null = null;

  if (!inTopIds.has(userId)) {
    if (period === 'all') {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { xp: true, email: true, currentStreak: true },
      });
      if (me) {
        const better = await prisma.user.count({ where: { xp: { gt: me.xp } } });
        currentUserEntry = {
          rank: better + 1,
          userId,
          displayName: maskEmail(me.email),
          xp: me.xp,
          currentStreak: me.currentStreak,
          isCurrentUser: true,
        };
      }
    } else {
      const myXp = xpByUser.get(userId) ?? 0;
      if (myXp > 0) {
        const me = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, currentStreak: true },
        });
        if (me) {
          currentUserEntry = {
            rank: computeRank(myXp, xpByUser),
            userId,
            displayName: maskEmail(me.email),
            xp: myXp,
            currentStreak: me.currentStreak,
            isCurrentUser: true,
          };
        }
      }
    }
  }

  // ── 4. Подсчёт total ────────────────────────────────────────────
  const total = period === 'all' ? await prisma.user.count() : xpByUser.size;

  // ── 5. Сборка entries ──────────────────────────────────────────
  const entries: LeaderboardEntry[] = topRows.map((r, idx) => ({
    rank: idx + 1,
    userId: r.userId,
    displayName: maskEmail(r.email),
    xp: r.xp,
    currentStreak: r.currentStreak,
    isCurrentUser: r.userId === userId,
  }));

  return {
    period,
    total,
    entries,
    currentUser: currentUserEntry,
    windowStart: weekWindow ? weekWindow.start.toISOString() : null,
    windowEnd: weekWindow ? weekWindow.end.toISOString() : null,
  };
}

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
  const learnedWords = (stateMap.graduated ?? 0) + (stateMap.review ?? 0);
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
      new: stateMap.new ?? 0,
      learning: stateMap.learning ?? 0,
      review: stateMap.review ?? 0,
      graduated: stateMap.graduated ?? 0,
    },
  };
}

/**
 * Возвращает [start, end) UTC для текущего календарного дня.
 * Чистая функция — покрыта юнит-тестами.
 */
export function getTodayUtcRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Считает количество ответов пользователя за текущий календарный день (UTC).
 * Используется в `getDashboard` для кольцевого прогресса ежедневной цели.
 */
export async function countTodayReviews(userId: string, now: Date = new Date()): Promise<number> {
  const { start, end } = getTodayUtcRange(now);
  return prisma.sessionAnswer.count({
    where: {
      session: { userId },
      answeredAt: { gte: start, lt: end },
    },
  });
}

export async function getDashboard(userId: string) {
  const [user, progressCounts, totalReviews] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, dailyGoal: true },
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

  const wordsLearned = (stateMap.graduated ?? 0) + (stateMap.review ?? 0);
  const xp = user?.xp ?? 0;
  // Если у пользователя почему-то dailyGoal == 0 (не должно быть благодаря
  // Prisma @default(20), но null-страховка не мешает) — отдаём дефолт.
  const dailyGoal = user?.dailyGoal && user.dailyGoal > 0 ? user.dailyGoal : DAILY_GOAL_DEFAULT;

  // Слова, которые нужно повторить сегодня: только learning/review, без новых слов.
  const now = new Date();
  const [wordsDueToday, todayReviews] = await Promise.all([
    prisma.userWordProgress.count({
      where: {
        userId,
        dueDate: { lte: now },
        state: { in: ['learning', 'review'] },
      },
    }),
    countTodayReviews(userId, now),
  ]);

  const { currentStreak } = await getUserStreak(userId);

  return {
    streak: currentStreak,
    wordsDueToday,
    wordsLearned,
    totalReviews,
    todayReviews,
    dailyGoal,
    xp,
  };
}

export async function resetProgress(userId: string) {
  await prisma.$transaction([
    prisma.sessionAnswer.deleteMany({ where: { session: { userId } } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.userWordProgress.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        xp: 0,
        currentStreak: 0,
        lastActiveDate: null,
      },
    }),
  ]);

  return { reset: true };
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
