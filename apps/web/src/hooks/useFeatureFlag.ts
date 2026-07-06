import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  type FlagEvaluation,
  type FlagsResponse,
  type PracticeType,
  practiceFlagKey,
} from '@hanzi/shared';
import { apiGet } from '../api/client';
import { PRACTICE_TYPES, type PracticeTypeInfo } from '../utils/practiceTypes';
import { trackExperimentExposed } from '../utils/analytics';

/**
 * Хуки для фичевых флагов (PLAN_Features_v0.2 §15).
 *
 * Бэкенд отдаёт «снимок» всех флагов для текущего пользователя
 * через `GET /api/flags`. Клиент кеширует его на 60 секунд — за это
 * время успевает пройти стартовая навигация и сценарий выбора
 * режима, без лишних запросов.
 *
 * На каждый «показ» флага (рендер UI-элемента, зависящего от флага)
 * вызывается `trackExperimentExposed(...)` — НО ровно один раз за
 * компонент-жизненный-цикл на каждый `flagKey` (через Set-ref), чтобы
 * не заспамить PostHog на повторных рендерах.
 */

const FLAGS_QUERY_KEY = ['flags'] as const;
const FLAGS_STALE_TIME_MS = 60_000;

/**
 * Хук: загружает все флаги разом. Для частых вызовов в разных
 * компонентах react-query дедуплицирует запрос.
 */
export function useFeatureFlags() {
  return useQuery<FlagsResponse['flags']>({
    queryKey: FLAGS_QUERY_KEY,
    queryFn: async () => {
      const data = await apiGet<FlagsResponse>('/flags');
      return data.flags;
    },
    staleTime: FLAGS_STALE_TIME_MS,
  });
}

/** Возвращает оценку одного флага. `undefined` если флаг ещё не загружен. */
export function useFeatureFlag(key: string): FlagEvaluation | undefined {
  const flags = useFeatureFlags();
  return flags.data?.[key];
}

/** Список зарегистрированных practice-флагов (для удобства UI). */
export const PRACTICE_FLAG_KEYS: string[] = PRACTICE_TYPES.map((p) =>
  practiceFlagKey(p.id),
);

/**
 * Хук: возвращает список типов практики, отфильтрованный по флагам.
 *
 * Поведение:
 *  - Если флаги ещё не загружены — возвращает весь список
 *    (fallback, чтобы UI не «мигал»).
 *  - Иначе скрывает типы с `enabled: false`.
 *  - Через `useEffect` шлёт `experiment_exposed` ровно один раз на
 *    `flagKey` за монтирование компонента (Set-ref защищает от
 *    дублей на повторных рендерах).
 */
export function usePracticeTypes(): PracticeTypeInfo[] {
  const flags = useFeatureFlags();
  const evaluated = flags.data;
  const isLoading = flags.isLoading;

  const visible: PracticeTypeInfo[] =
    isLoading || !evaluated
      ? PRACTICE_TYPES
      : PRACTICE_TYPES.filter((p) => {
          const flagKey = practiceFlagKey(p.id);
          return evaluated[flagKey]?.enabled ?? true;
        });

  // Один exposure-событие на flagKey за время жизни компонента.
  // Используем useEffect, чтобы не дёргать `track(...)` во время рендера
  // (важно для React.StrictMode: effect'ы вызываются после коммита).
  const exposedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isLoading || !evaluated) return;
    for (const p of visible) {
      const flagKey = practiceFlagKey(p.id);
      if (exposedRef.current.has(flagKey)) continue;
      const evaluation = evaluated[flagKey];
      trackExperimentExposed({
        flagKey,
        enabled: true,
        reason: evaluation?.reason ?? 'rollout',
      });
      exposedRef.current.add(flagKey);
    }
  }, [visible, evaluated, isLoading]);

  return visible;
}

/**
 * Удобный helper: проверяет, доступен ли конкретный тип практики
 * текущему пользователю. Не шлёт exposure (для этого есть
 * `usePracticeTypes` / явные `useFeatureFlag` вызовы).
 */
export function isPracticeTypeEnabled(
  type: PracticeType,
  flags: FlagsResponse['flags'] | undefined,
): boolean {
  if (!flags) return true; // fallback до загрузки
  const key = practiceFlagKey(type);
  return flags[key]?.enabled ?? true;
}
