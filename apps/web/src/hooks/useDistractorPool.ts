import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Word } from '@hanzi/shared';

interface UseDistractorPoolOptions {
  /** Сколько случайных слов вернуть. */
  count?: number;
  /** Включать ли запрос. */
  enabled?: boolean;
}

/**
 * Хук для получения пула случайных слов — используется для генерации
 * дистракторов в multiple-choice / reverse-choice / syllable-constructor
 * практиках.
 *
 * Пул НЕ зависит от конкретной карточки: исключение id делается
 * клиентом (в карточках) — это позволяет переиспользовать один и тот же
 * пул между карточками и не плодить запросы на каждое слово.
 */
export function useDistractorPool({
  count = 24,
  enabled = true,
}: UseDistractorPoolOptions = {}) {
  return useQuery({
    queryKey: ['distractor-pool', count],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('count', String(count));
      // `apiGet` сам разворачивает `data` из ответа `{ success, data, … }`.
      return apiGet<Word[]>(`/sessions/random-words?${params.toString()}`);
    },
    enabled,
    // Кэшируем надолго — словарь статичен, можно подмешивать из сессии.
    staleTime: 5 * 60_000,
  });
}
