import { z } from 'zod';

/**
 * Состояние изучения слова (FSRS).
 * - new: ещё не учил
 * - learning: в процессе первичного запоминания
 * - review: на интервальном повторении
 * - graduated: полностью усвоено, редкие повторения
 */
export const WordStateSchema = z.enum(['new', 'learning', 'review', 'graduated']);
export type WordState = z.infer<typeof WordStateSchema>;

/**
 * Оценка ответа пользователя (FSRS rating).
 * - 1 (Again): совсем не помню
 * - 2 (Hard): вспомнил с трудом
 * - 3 (Good): вспомнил нормально
 * - 4 (Easy): вспомнил легко
 */
export const SrsRatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export type SrsRating = z.infer<typeof SrsRatingSchema>;

/**
 * Прогресс пользователя по конкретному слову (FSRS-параметры).
 *
 * Пример (слово "喜欢" у user X):
 *   state: "review"
 *   stability: 12.5
 *   difficulty: 5.5
 *   reps: 8
 *   dueDate: "2026-06-30T18:00:00.000Z"
 */
export const UserWordProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  wordId: z.string().uuid(),
  state: WordStateSchema,
  /** Стабильность памяти (FSRS stability) — в днях */
  stability: z.number().nonnegative().default(0),
  /**
   * Сложность слова для пользователя — каноническая FSRS-5 шкала D ∈ [1, 10]
   * (PLAN_Features_v0.4 §46). Формула `(11 − D)` в stability-инкременте
   * рассчитана именно на неё: при D ∈ [0, 1] множитель был константой и
   * сложность почти не влияла на планирование.
   */
  difficulty: z.number().min(1).max(10).default(5),
  /** Количество повторений */
  reps: z.number().int().nonnegative().default(0),
  /** Дата следующего показа */
  dueDate: z.string().datetime(),
  /** Дата последнего повторения */
  lastReviewDate: z.string().datetime().nullable().default(null),
});

export type UserWordProgress = z.infer<typeof UserWordProgressSchema>;

/** DTO для записи ответа на карточку */
export const RecordAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  wordId: z.string().uuid(),
  rating: SrsRatingSchema,
  /** Время ответа в миллисекундах (для аналитики) */
  responseTimeMs: z.number().int().nonnegative().optional(),
  /**
   * Момент ответа (ISO-строка), штампуется клиентом ОДИН раз на ответ.
   * Сервер ставит его в `lastReviewDate`, а fallback-очередь кладёт
   * тот же самый timestamp — поэтому дедуп `changeTime <= existingTime`
   * в sync.service.ts отбрасывает повторный flush после успешного
   * live-post (fix v0.4 §45 follow-up).
   */
  answeredAt: z.string().datetime().optional(),
});

export type RecordAnswer = z.infer<typeof RecordAnswerSchema>;

/** Результат пересчёта SRS (возвращается сервером после ответа) */
export const SrsRecalcResultSchema = z.object({
  wordId: z.string().uuid(),
  newStability: z.number().nonnegative(),
  newDifficulty: z.number().min(1).max(10),
  newState: WordStateSchema,
  newDueDate: z.string().datetime(),
  /** Интервал до следующего показа в днях */
  intervalDays: z.number().nonnegative(),
});

export type SrsRecalcResult = z.infer<typeof SrsRecalcResultSchema>;
