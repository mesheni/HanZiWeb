import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Word, WordListItem, WordFilters, PaginatedResponse } from '@hanzi/shared';

/**
 * Хук для получения списка слов.
 * TODO: подключить к реальному API когда бэкенд будет готов.
 */
export function useWords(filters: WordFilters = { limit: 50, offset: 0 }) {
  return useQuery({
    queryKey: ['words', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.hskLevel) params.set('hskLevel', String(filters.hskLevel));
      if (filters.deckId) params.set('deckId', filters.deckId);
      if (filters.status) params.set('status', filters.status);
      params.set('limit', String(filters.limit));
      params.set('offset', String(filters.offset));
      return apiGet<PaginatedResponse<WordListItem>>(`/words?${params.toString()}`);
    },
    enabled: false, // отключено до готовности API
  });
}

/**
 * Хук для получения одного слова.
 */
export function useWord(id: string | null) {
  return useQuery({
    queryKey: ['word', id],
    queryFn: () => apiGet<Word>(`/words/${id}`),
    enabled: !!id,
  });
}
