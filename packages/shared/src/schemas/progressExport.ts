import { z } from 'zod';

/**
 * Экспорт/импорт прогресса пользователя.
 * См. PLAN_Features_v0.2 §10.
 *
 * Формат JSON-файла:
 * {
 *   "version": 1,
 *   "exportedAt": "2026-07-04T12:00:00.000Z",
 *   "userId": "uuid",
 *   "progress": [
 *     {
 *       "wordId": "uuid",
 *       "state": "learning",
 *       "stability": 1.2,
 *       "difficulty": 5.0,
 *       "reps": 3,
 *       "dueDate": "2026-07-04T12:00:00.000Z",
 *       "lastReviewDate": "2026-07-03T12:00:00.000Z" | null
 *     },
 *     ...
 *   ]
 * }
 *
 * CSV-формат: первая строка — заголовок
 * `wordId,state,stability,difficulty,reps,dueDate,lastReviewDate`,
 * далее по одной записи на строку. `lastReviewDate` пустая строка, если null.
 */

export const PROGRESS_EXPORT_VERSION = 1 as const;

/** Состояние карточки — совпадает с Prisma `WordState` enum. */
export const ProgressStateSchema = z.enum(['new', 'learning', 'review', 'graduated']);
export type ProgressState = z.infer<typeof ProgressStateSchema>;

/** Одна запись прогресса (без зависимости от пользователя). */
export const ProgressRecordSchema = z.object({
  wordId: z.string().uuid(),
  state: ProgressStateSchema,
  stability: z.number().nonnegative(),
  difficulty: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  /** ISO-строка даты (для совместимости с JSON). */
  dueDate: z.string().datetime(),
  lastReviewDate: z.string().datetime().nullable(),
});
export type ProgressRecord = z.infer<typeof ProgressRecordSchema>;

/** Корневой объект экспорта. */
export const ProgressExportSchema = z.object({
  /** Версия формата — сейчас всегда 1. */
  version: z.literal(PROGRESS_EXPORT_VERSION),
  /** ISO-строка момента экспорта. */
  exportedAt: z.string().datetime(),
  /** UUID пользователя, чей это прогресс. */
  userId: z.string().uuid(),
  progress: z.array(ProgressRecordSchema),
});
export type ProgressExport = z.infer<typeof ProgressExportSchema>;

/** Режим импорта:
 *  - `merge`   — обновляет существующие записи, добавляет новые;
 *  - `replace` — удаляет весь текущий прогресс пользователя и заменяет на присланный. */
export const ProgressImportModeSchema = z.enum(['merge', 'replace']);
export type ProgressImportMode = z.infer<typeof ProgressImportModeSchema>;

/** Запрос на импорт (JSON-формат). */
export const ProgressImportRequestSchema = z.object({
  mode: ProgressImportModeSchema.default('merge'),
  progress: z.array(ProgressRecordSchema),
});
export type ProgressImportRequest = z.infer<typeof ProgressImportRequestSchema>;

/** Ответ сервера на импорт. */
export const ProgressImportResponseSchema = z.object({
  /** Режим, в котором был выполнен импорт. */
  mode: ProgressImportModeSchema,
  /** Сколько записей было в запросе. */
  total: z.number().int().nonnegative(),
  /** Сколько новых записей добавлено (не существовали ранее). */
  imported: z.number().int().nonnegative(),
  /** Сколько существующих записей обновлено. */
  updated: z.number().int().nonnegative(),
  /** Сколько записей проигнорировано (например, wordId не найден в БД). */
  skipped: z.number().int().nonnegative(),
  /** ISO-строка момента применения импорта. */
  importedAt: z.string().datetime(),
});
export type ProgressImportResponse = z.infer<typeof ProgressImportResponseSchema>;
