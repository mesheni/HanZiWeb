import { z } from 'zod';

/**
 * Имена событий аналитики (PLAN_Features_v0.2 §14).
 *
 * Жёстко фиксированный список: добавлять новые события нужно через
 * обновление этой схемы + соответствующих интеграций в web/app.
 */
export const AnalyticsEventNameSchema = z.enum([
  'session_started',
  'answer_rated',
  'audio_generated',
  'experiment_exposed',
]);
export type AnalyticsEventName = z.infer<typeof AnalyticsEventNameSchema>;

/**
 * Один инпут события, присылаемый клиентом.
 *
 * `distinctId` опционален: если пользователь авторизован, сервер сам
 * проставит `userId` из JWT. Анонимный `distinctId` берётся из тела
 * (получен из `crypto.randomUUID()` на клиенте и сохранён в localStorage).
 */
export const AnalyticsEventInputSchema = z.object({
  /** Имя события. */
  name: AnalyticsEventNameSchema,
  /** Уникальный ID пользователя (анонимный UUID, если нет логина). */
  distinctId: z.string().min(1).max(128).optional(),
  /** ISO-8601 timestamp события на клиенте. */
  timestamp: z
    .string()
    .datetime()
    .optional(),
  /** Произвольные свойства события (валидируются поверхностно). */
  properties: z.record(z.string(), z.unknown()).optional(),
});
export type AnalyticsEventInput = z.infer<typeof AnalyticsEventInputSchema>;

/** Тело POST /api/ingest. */
export const AnalyticsIngestSchema = z.object({
  /** Батч событий (обычно 1, но допускаем массив для будущего flush). */
  events: z.array(AnalyticsEventInputSchema).min(1).max(50),
});
export type AnalyticsIngest = z.infer<typeof AnalyticsIngestSchema>;
