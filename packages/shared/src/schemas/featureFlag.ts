import { z } from 'zod';

/**
 * Фичи-флаги и A/B-эксперименты (PLAN_Features_v0.2 §15).
 *
 * Внутренняя альтернатива LaunchDarkly / Stytch для гейтинга новых
 * режимов тренировки и будущих экспериментов. Флаги определяются
 * статически в коде (см. `apps/server/src/lib/featureFlags/flags.ts`)
 * с возможностью override через ENV (`FEATURE_FLAG_<KEY>_ENABLED` /
 * `_ROLLOUT`). Для каждого пользователя решение принимается
 * детерминированно:
 *  - `enabled: false`            → флаг выключен для всех (`disabled`).
 *  - userId ∈ `whitelist`        → флаг включён для этого юзера (`whitelist`).
 *  - `hash(key:userId) % 100 < rolloutPercent` → флаг включён (`rollout`).
 *  - иначе                      → флаг выключен (`disabled`).
 *
 * Клиент получает «снимок» через `GET /api/flags` и кеширует.
 */

/**
 * Причина, по которой флаг оказался в текущем состоянии.
 * Полезно для аналитики (`experiment_exposed`) и отладки.
 *  - `whitelist`  — пользователь явно в whitelist (force-on).
 *  - `rollout`    — попал в rollout-bucket по хешу key+userId.
 *  - `disabled`   — флаг выключен глобально или не попал в rollout.
 *  - `unknown`    — флаг с таким `key` не зарегистрирован.
 */
export const FlagReasonSchema = z.enum(['whitelist', 'rollout', 'disabled', 'unknown']);
export type FlagReason = z.infer<typeof FlagReasonSchema>;

/** Результат оценки одного флага для конкретного пользователя. */
export const FlagEvaluationSchema = z.object({
  /** Ключ флага (например, `practice:cloze`). */
  key: z.string().min(1).max(128),
  /** Включён ли флаг для пользователя (UI решает на основе этого). */
  enabled: z.boolean(),
  /** Почему флаг в этом состоянии (для аналитики/отладки). */
  reason: FlagReasonSchema,
});
export type FlagEvaluation = z.infer<typeof FlagEvaluationSchema>;

/**
 * Снимок всех известных флагов для пользователя.
 * Ключи — это `FlagEvaluation.key`, значения — оценки.
 */
export const FlagsResponseSchema = z.object({
  flags: z.record(z.string(), FlagEvaluationSchema),
});
export type FlagsResponse = z.infer<typeof FlagsResponseSchema>;

/**
 * Канонические ключи флагов для режимов тренировки.
 * Совпадают с `PracticeType` из `schemas/session.ts` после префикса `practice:`.
 *
 * Хранится здесь (а не в session.ts), чтобы UI/сервер договорились
 * о стабильном namespace для A/B-тестов. Менять не рекомендуется —
 * это публичный контракт.
 */
export const PRACTICE_FLAG_PREFIX = 'practice:';

export function practiceFlagKey(practiceType: string): string {
  return `${PRACTICE_FLAG_PREFIX}${practiceType}`;
}
