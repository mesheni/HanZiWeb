import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Word } from '@hanzi/shared';

interface RandomWordsResponse {
  success: true;
  data: Word[];
}

interface UseDistractorPoolOptions {
  /** Идентификаторы слов, которые нужно исключить (например, текущая сессия). */
  excludeIds: string[];
  /** Сколько случайных слов вернуть. */
  count?: number;
  /** Включать ли запрос (например, только для multiple-choice режима). */
  enabled?: boolean;
}

/**
 * Хук для получения пула случайных слов — используется для генерации
 * дистракторов в multiple-choice / reverse-choice / syllable-constructor
 * практиках.
 */
export function useDistractorPool({
  excludeIds,
  count = 9,
  enabled = true,
}: UseDistractorPoolOptions) {
  return useQuery({
    queryKey: ['distractor-pool', count, excludeIds.slice().sort().join(',')],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('count', String(count));
      if (excludeIds.length > 0) {
        params.set('exclude', excludeIds.join(','));
      }
      const res = await apiGet<RandomWordsResponse>(`/sessions/random-words?${params.toString()}`);
      return res.data;
    },
    enabled: enabled && excludeIds.length > 0,
    staleTime: 60_000,
  });
}
