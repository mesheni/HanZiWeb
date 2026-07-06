import { FlagsResponseSchema, type FlagEvaluation } from '@hanzi/shared';
import { evaluateAllFlags, evaluateFlag, getKnownFlagKeys } from '../../lib/featureFlags/flags.js';

/**
 * Сервис фичевых флагов (PLAN_Features_v0.2 §15).
 *
 * Тонкая обёртка над `lib/featureFlags/flags.ts` — нужна для того,
 * чтобы routes были декларативными и легко тестировались.
 */

export function getAllFlagsForUser(userId?: string | null): {
  flags: Record<string, FlagEvaluation>;
} {
  return {
    flags: evaluateAllFlags(userId),
  };
}

export function getFlagForUser(
  key: string,
  userId?: string | null,
): { evaluation: FlagEvaluation; known: boolean } {
  const known = getKnownFlagKeys().includes(key);
  return {
    evaluation: evaluateFlag(key, userId),
    known,
  };
}

/** Валидирует ответ, чтобы контракт API был гарантирован. */
export function buildFlagsResponse(userId?: string | null): {
  flags: Record<string, FlagEvaluation>;
} {
  const payload = getAllFlagsForUser(userId);
  return FlagsResponseSchema.parse(payload);
}
