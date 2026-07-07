import { createHash } from 'node:crypto';
import type { FlagEvaluation } from '@hanzi/shared';
import { practiceFlagKey } from '@hanzi/shared';

/**
 * Feature flags / A/B-тесты (PLAN_Features_v0.2 §15).
 *
 * Внутренняя альтернатива LaunchDarkly / Stytch: статический реестр
 * флагов + детерминированная оценка для пользователя. Поддерживает:
 *  - master switch (`enabled`);
 *  - whitelist (`userIds, для которых флаг принудительно включён);
 *  - percentage rollout (`rolloutPercent: 0-100`, стабильный
 *    bucket = `hash(key:userId) % 100`);
 *  - override через ENV (`FEATURE_FLAG_<KEY>_ENABLED` / `_ROLLOUT`).
 *
 * Один и тот же `(key, userId)` всегда даёт одинаковый результат
 * (важно для A/B-экспериментов: пользователь не «прыгает» между
 * контролем и treatment от запроса к запросу).
 *
 * Не путать с PostHog: флаги — это server-side решения о доступности
 * фичи; PostHog — это сбор аналитики о поведении. Exposure-события
 * отправляются в PostHog, когда пользователь увидел флаг (см.
 * `trackExperimentExposed` в web).
 */

export interface FeatureFlagConfig {
  /** Мастер-выключатель. `false` — флаг выключен для всех. */
  enabled: boolean;
  /** Процент пользователей (0-100), попадающих в rollout. */
  rolloutPercent: number;
  /** Список userId, для которых флаг принудительно включён. */
  whitelist: string[];
}

/**
 * Реестр дефолтных конфигов. Ключи — это стабильные строки
 * (`practice:cloze`, `practice:multiple-choice`, …).
 *
 * Дефолт для всех известных режимов тренировки — `enabled: true,
 * rolloutPercent: 100`: всё работает как раньше, пока кто-то явно
 * не закроет (`enabled: false`) или не ограничит (`rolloutPercent`)
 * через edit кода / ENV.
 *
 * Чтобы добавить новый флаг, достаточно дописать запись сюда.
 */
export const FEATURE_FLAGS: Readonly<Record<string, FeatureFlagConfig>> = Object.freeze({
  [practiceFlagKey('flip-card')]: { enabled: true, rolloutPercent: 100, whitelist: [] },
  [practiceFlagKey('multiple-choice')]: { enabled: true, rolloutPercent: 100, whitelist: [] },
  [practiceFlagKey('reverse-choice')]: { enabled: true, rolloutPercent: 100, whitelist: [] },
  [practiceFlagKey('pinyin-input')]: { enabled: true, rolloutPercent: 100, whitelist: [] },
  [practiceFlagKey('tone-recognition')]: { enabled: true, rolloutPercent: 100, whitelist: [] },
  [practiceFlagKey('syllable-constructor')]: { enabled: true, rolloutPercent: 100, whitelist: [] },
  [practiceFlagKey('cloze')]: { enabled: true, rolloutPercent: 100, whitelist: [] },
  [practiceFlagKey('character_assembly')]: { enabled: true, rolloutPercent: 100, whitelist: [] },
});

/**
 * Возвращает эффективный конфиг флага с учётом ENV-override.
 * Сейчас поддерживаются:
 *  - `FEATURE_FLAG_<UPPER_KEY>_ENABLED=true|false`
 *  - `FEATURE_FLAG_<UPPER_KEY>_ROLLOUT=0..100`
 *
 * `<UPPER_KEY>` — это key, где `:` и `-` заменены на `_` и
 * приведены к UPPERCASE. Пример: `practice:cloze` →
 * `FEATURE_FLAG_PRACTICE_CLOZE_*`.
 */
export function getEffectiveConfig(key: string): FeatureFlagConfig | null {
  const defaults = FEATURE_FLAGS[key];
  if (!defaults) return null;

  const envKey = flagKeyToEnv(key);
  const enabledRaw = process.env[`${envKey}_ENABLED`];
  const rolloutRaw = process.env[`${envKey}_ROLLOUT`];

  let enabled = defaults.enabled;
  if (enabledRaw !== undefined) {
    enabled = enabledRaw === 'true' || enabledRaw === '1';
  }

  let rolloutPercent = defaults.rolloutPercent;
  if (rolloutRaw !== undefined) {
    const parsed = Number(rolloutRaw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
      rolloutPercent = Math.floor(parsed);
    }
  }

  return {
    enabled,
    rolloutPercent,
    whitelist: defaults.whitelist,
  };
}

/** Стабильный хеш `key:userId` → bucket 0-99 (для percentage rollout). */
export function hashToBucket(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  // Берём первые 4 байта как unsigned int → modulo 100.
  const n = digest.readUInt32BE(0);
  return n % 100;
}

/**
 * Оценивает флаг для пользователя.
 *
 * Логика:
 *  1. Если `key` не зарегистрирован → `{ enabled: false, reason: 'unknown' }`.
 *  2. Если флаг `enabled: false` → `{ enabled: false, reason: 'disabled' }`.
 *  3. Если `userId ∈ whitelist` → `{ enabled: true, reason: 'whitelist' }`.
 *  4. Если `hash(key:userId) % 100 < rolloutPercent` → `{ enabled: true, reason: 'rollout' }`.
 *  5. Иначе → `{ enabled: false, reason: 'disabled' }` (не попал в rollout).
 *
 * `userId` опционален: для анонимных пользователей bucket вычисляется
 * по стабильному ключу `key:anonymous` (все анонимы получают одно
 * и то же решение для одного флага). Это упрощает интеграцию, но
 * для боевого A/B-теста обычно хотят хотя бы авторизацию.
 */
export function evaluateFlag(key: string, userId?: string | null): FlagEvaluation {
  const config = getEffectiveConfig(key);
  if (!config) {
    return { key, enabled: false, reason: 'unknown' };
  }

  if (!config.enabled) {
    return { key, enabled: false, reason: 'disabled' };
  }

  if (userId && config.whitelist.includes(userId)) {
    return { key, enabled: true, reason: 'whitelist' };
  }

  if (config.rolloutPercent <= 0) {
    return { key, enabled: false, reason: 'disabled' };
  }

  if (config.rolloutPercent >= 100) {
    return { key, enabled: true, reason: 'rollout' };
  }

  const bucketInput = userId ? `${key}:${userId}` : `${key}:anonymous`;
  const bucket = hashToBucket(bucketInput);
  if (bucket < config.rolloutPercent) {
    return { key, enabled: true, reason: 'rollout' };
  }

  return { key, enabled: false, reason: 'disabled' };
}

/** Оценивает все известные флаги разом (для `GET /api/flags`). */
export function evaluateAllFlags(userId?: string | null): Record<string, FlagEvaluation> {
  const out: Record<string, FlagEvaluation> = {};
  for (const key of Object.keys(FEATURE_FLAGS)) {
    out[key] = evaluateFlag(key, userId);
  }
  return out;
}

/** Список ключей всех зарегистрированных флагов (для админ-эндпоинтов). */
export function getKnownFlagKeys(): string[] {
  return Object.keys(FEATURE_FLAGS);
}

// ── helpers ─────────────────────────────────────────────────────────

function flagKeyToEnv(key: string): string {
  return `FEATURE_FLAG_${key.toUpperCase().replace(/[:-]/g, '_')}`;
}
