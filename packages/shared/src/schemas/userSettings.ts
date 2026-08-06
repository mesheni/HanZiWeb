import { z } from 'zod';

/** Минимально и максимально допустимая ежедневная цель. */
export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 200;
/** Цель по умолчанию, если у пользователя не задан `dailyGoal`. */
export const DAILY_GOAL_DEFAULT = 20;

/**
 * Валидация IANA-таймзоны (fix v0.4 §24/§25 follow-up).
 * Использует `Intl.supportedValuesOf('timeZone')`; если API недоступен
 * (старые JS-движки) — пропускаем (серверный Node Intl всё равно
 * отбросит невалидное значение на своём конце).
 */
export function isValidIanaTimezone(value: string): boolean {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (!supported) return true;
    return supported.includes(value);
  } catch {
    return true;
  }
}

/**
 * Текущие пользовательские настройки (включая `dailyGoal`).
 * Используется в `GET /api/users/settings`.
 */
export const UserSettingsSchema = z.object({
  dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX),
  /**
   * IANA-таймзона пользователя (например, "Europe/Moscow"). `null` = UTC
   * (backward-compat для существующих юзеров). Используется daily-статистикой
   * (стрик, heatmap) — PLAN_Features_v0.4 §24/§25.
   */
  timezone: z
    .string()
    .max(64)
    .refine(isValidIanaTimezone, 'Invalid IANA timezone')
    .nullable(),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

/**
 * Патч для обновления пользовательских настроек.
 * Используется в `PUT /api/users/settings`.
 *
 * `dailyGoal` (PLAN_Features_v0.2 §9) + `timezone` (v0.4 §24/§25);
 * схема расширяемая — новые поля добавляются как optional.
 */
export const UpdateUserSettingsSchema = z.object({
  dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
  /** IANA-таймзона; `null` — сброс на UTC. */
  timezone: z
    .string()
    .max(64)
    .refine(isValidIanaTimezone, 'Invalid IANA timezone')
    .nullable()
    .optional(),
});

export type UpdateUserSettings = z.infer<typeof UpdateUserSettingsSchema>;
