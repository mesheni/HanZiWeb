import { prisma } from '../../lib/prisma.js';
import type { AchievementType, UserAchievement } from '@hanzi/shared';

/** Пороги для достижений (вынесены в константы для тестов и UI). */
export const STREAK_7_TARGET = 7;
export const WORDS_100_TARGET = 100;
export const REVIEWS_10K_TARGET = 10_000;

/** Все известные типы достижений (для UI и валидации). */
const ALL_TYPES: readonly AchievementType[] = [
  'streak_7',
  'words_100',
  'hsk1_complete',
  'reviews_10k',
  'perfect_session',
];

/**
 * Чистый хелпер: разбивает список `unlocked` на «уже разблокированные
 * типы» и возвращает набор для быстрого membership-check.
 */
export function unlockedSet(unlocked: { type: string }[]): Set<string> {
  return new Set(unlocked.map((a) => a.type));
}

/**
 * Возвращает все достижения пользователя, отсортированные по дате
 * разблокировки (DESC — свежие сверху).
 */
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

/**
 * Проверяет и разблокирует достижения, основанные на пользовательских
 * метриках (XP/стрик/количество выученных/HSK1/все ревью).
 *
 * Чистая функция «что проверить» принимает на вход userId + текущие
 * значения и возвращает типы, которые должны быть разблокированы.
 * Это позволяет покрыть логику юнит-тестами без БД.
 */
export interface CheckableStats {
  currentStreak: number;
  learnedWords: number;
  totalReviews: number;
  hsk1Mastered: number;
  hsk1Total: number;
}

/**
 * Чистая функция: какие из «глобальных» достижений должны быть
 * разблокированы, исходя из текущих показателей. Не трогает
 * `perfect_session` — это per-session событие.
 */
export function pickGlobalUnlocks(stats: CheckableStats): AchievementType[] {
  const out: AchievementType[] = [];
  if (stats.currentStreak >= STREAK_7_TARGET) out.push('streak_7');
  if (stats.learnedWords >= WORDS_100_TARGET) out.push('words_100');
  if (stats.totalReviews >= REVIEWS_10K_TARGET) out.push('reviews_10k');
  if (stats.hsk1Total > 0 && stats.hsk1Mastered >= stats.hsk1Total) {
    out.push('hsk1_complete');
  }
  return out;
}

/**
 * Собирает текущие показатели пользователя одним SQL-запросом (агрегаты)
 * и возвращает их в виде `CheckableStats`. Чистая функция — без побочных
 * эффектов.
 */
export async function gatherStats(userId: string): Promise<CheckableStats> {
  const [user, progressCounts, totalReviews, hsk1Total, hsk1Mastered] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { currentStreak: true },
    }),
    prisma.userWordProgress.groupBy({
      by: ['state'],
      where: { userId },
      _count: true,
    }),
    prisma.sessionAnswer.count({
      where: { session: { userId } },
    }),
    prisma.word.count({ where: { hskLevel: 1 } }),
    prisma.userWordProgress.count({
      where: { userId, state: 'graduated', word: { is: { hskLevel: 1 } } },
    }),
  ]);

  const stateMap: Record<string, number> = {};
  for (const row of progressCounts) {
    stateMap[row.state] = row._count;
  }
  const learnedWords = (stateMap.graduated ?? 0) + (stateMap.review ?? 0);

  return {
    currentStreak: user?.currentStreak ?? 0,
    learnedWords,
    totalReviews,
    hsk1Mastered,
    hsk1Total,
  };
}

/**
 * Проверяет все «глобальные» достижения и разблокирует новые
 * (идемпотентно — `@@unique([userId, type])`).
 *
 * Возвращает список только что разблокированных достижений
 * (с `unlockedAt = now()`), не считая тех, что уже были.
 */
export async function checkGlobalAchievements(
  userId: string,
): Promise<UserAchievement[]> {
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
        update: {}, // уже было — ничего не делаем
      }),
    ),
  );

  return created.map((r) => ({
    id: r.id,
    type: r.type as AchievementType,
    unlockedAt: r.unlockedAt.toISOString(),
  }));
}

/**
 * Проверяет, была ли сессия «идеальной» — все ответы = Easy (4).
 *
 * Сессия считается «идеальной», только если в ней есть хотя бы
 * один ответ (иначе это пустая сессия) и все они Easy.
 */
export async function checkPerfectSession(
  userId: string,
  sessionId: string,
): Promise<UserAchievement | null> {
  const [answers, existing] = await Promise.all([
    prisma.sessionAnswer.findMany({
      where: { sessionId, session: { userId } },
      select: { rating: true },
    }),
    prisma.userAchievement.findUnique({
      where: { userId_type: { userId, type: 'perfect_session' } },
    }),
  ]);

  if (existing) return null;
  if (answers.length === 0) return null;
  const allEasy = answers.every((a) => a.rating === 4);
  if (!allEasy) return null;

  const created = await prisma.userAchievement.upsert({
    where: { userId_type: { userId, type: 'perfect_session' } },
    create: { userId, type: 'perfect_session' },
    update: {},
  });

  return {
    id: created.id,
    type: 'perfect_session',
    unlockedAt: created.unlockedAt.toISOString(),
  };
}

/**
 * Удобный wrapper: проверяет все достижения для пользователя после
 * очередного ответа. Используется в `sessions.service.recordAnswer`.
 *
 * - Глобальные: стрик / 100 слов / 10k ревью / HSK 1.
 * - Per-session: идеальная сессия.
 *
 * Возвращает массив только что разблокированных достижений (может
 * быть пустым).
 */
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

/** Экспортируется для тестов и потенциального UI-сброса. */
export const ALL_ACHIEVEMENT_TYPES = ALL_TYPES;
