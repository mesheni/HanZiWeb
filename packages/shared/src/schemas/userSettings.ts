import { z } from 'zod';

/** Минимально и максимально допустимая ежедневная цель. */
export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 200;
/** Цель по умолчанию, если у пользователя не задан `dailyGoal`. */
export const DAILY_GOAL_DEFAULT = 20;

/**
 * Текущие пользовательские настройки (включая `dailyGoal`).
 * Используется в `GET /api/users/settings`.
 */
export const UserSettingsSchema = z.object({
  dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

/**
 * Патч для обновления пользовательских настроек.
 * Используется в `PUT /api/users/settings`.
 *
 * Сейчас поддерживается только `dailyGoal` (PLAN_Features_v0.2 §9);
 * схема расширяемая — новые поля добавляются как optional.
 */
export const UpdateUserSettingsSchema = z.object({
  dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
});

export type UpdateUserSettings = z.infer<typeof UpdateUserSettingsSchema>;
