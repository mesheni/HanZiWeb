import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Word, WordListItem, WordFilters, PaginatedResponse } from '@hanzi/shared';

function buildWordParams(filters: Partial<WordFilters>): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.hskLevel) params.set('hskLevel', String(filters.hskLevel));
  if (filters.deckId) params.set('deckId', filters.deckId);
  if (filters.status) params.set('status', filters.status);
  params.set('limit', String(filters.limit ?? 50));
  params.set('offset', String(filters.offset ?? 0));
  return params;
}

type UseWordsFilters = Partial<WordFilters>;

/**
 * Хук для получения списка слов.
 */
export function useWords(filters: UseWordsFilters = {}) {
  return useQuery({
    queryKey: ['words', filters],
    queryFn: () => {
      const params = buildWordParams({ ...filters });
      return apiGet<PaginatedResponse<WordListItem>>(`/words?${params.toString()}`);
    },
  });
}

interface PageParam {
  offset: number;
  limit: number;
}

type WordInfiniteFilters = Partial<Omit<WordFilters, 'offset' | 'limit'>>;

/**
 * Хук с бесконечным скроллом для библиотеки слов.
 */
export function useInfiniteWords(filters: WordInfiniteFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['words', 'infinite', filters],
    queryFn: ({ pageParam }) => {
      const params = buildWordParams({ ...filters, ...pageParam });
      return apiGet<PaginatedResponse<WordListItem>>(`/words?${params.toString()}`);
    },
    initialPageParam: { offset: 0, limit: 20 } satisfies PageParam,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const nextOffset = lastPageParam.offset + lastPageParam.limit;
      if (nextOffset >= lastPage.pagination.total) return undefined;
      return { offset: nextOffset, limit: lastPageParam.limit };
    },
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
