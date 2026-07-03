import { z } from 'zod';

/**
 * Leaderboard — публичная социальная статистика (PLAN_Features_v0.2 §7).
 *
 * Эндпоинт `GET /stats/leaderboard?period=week|all` возвращает
 * топ-100 пользователей по XP/стрику.
 *
 * Период:
 *  - `week` — за текущую календарную неделю (Пн–Вс по UTC), считаем XP
 *    только за ответы, данные в `SessionAnswer.answeredAt` внутри окна.
 *  - `all`  — за всё время, простая сортировка по `User.xp`.
 */

/** Запрос на leaderboard */
export const LeaderboardQuerySchema = z.object({
  period: z.enum(['week', 'all']).default('week'),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;

/** Одна запись в таблице лидеров. */
export const LeaderboardEntrySchema = z.object({
  /** Позиция в рейтинге (1-based). */
  rank: z.number().int().positive(),
  /** UUID пользователя. */
  userId: z.string().uuid(),
  /** Маскированный email вида `ab***@gmail.com` — без раскрытия полного. */
  displayName: z.string().min(1),
  /** Суммарный XP пользователя за выбранный период. */
  xp: z.number().int().nonnegative(),
  /** Лучший стрик (или текущий — для режима "all") пользователя. */
  currentStreak: z.number().int().nonnegative(),
  /** true, если эта запись — сам запрашивающий пользователь. */
  isCurrentUser: z.boolean(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

/** Ответ leaderboard. */
export const LeaderboardResponseSchema = z.object({
  /** Выбранный период (`week` | `all`). */
  period: z.enum(['week', 'all']),
  /** Общее число пользователей, участвующих в рейтинге. */
  total: z.number().int().nonnegative(),
  /** Топ-100 (или меньше, если пользователей мало). */
  entries: z.array(LeaderboardEntrySchema),
  /**
   * Текущий пользователь не вошёл в топ — отдельный объект с его
   * рангом и XP. null, если он в `entries`.
   */
  currentUser: LeaderboardEntrySchema.nullable(),
  /**
   * Начало окна периода (ISO-строка). Для `all` — `null`.
   * Полезно клиенту, чтобы не считать самостоятельно.
   */
  windowStart: z.string().datetime().nullable(),
  /** Конец окна (exclusive) — ISO-строка. */
  windowEnd: z.string().datetime().nullable(),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;
