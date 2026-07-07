import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { getDb } from '../db/database';
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
    queryFn: async () => {
      const params = buildWordParams({ ...filters });
      const result = await apiGet<PaginatedResponse<WordListItem>>(`/words?${params.toString()}`);
      const db = getDb();
      if (db) {
        for (const item of result.data) {
          const w = item as any;
          await db.words.upsert({
            id: w.id,
            character: w.character,
            pinyin: w.pinyin,
            translation: w.translation,
            hskLevel: w.hskLevel,
            audioUrl: w.audioUrl ?? null,
            mnemonic: w.mnemonic ?? null,
            createdAt: w.createdAt ?? new Date().toISOString(),
            examples: w.examples ?? [],
          });
        }
      }
      return result;
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
    queryFn: async ({ pageParam }) => {
      const params = buildWordParams({ ...filters, ...pageParam });
      const result = await apiGet<PaginatedResponse<WordListItem>>(`/words?${params.toString()}`);
      const db = getDb();
      if (db) {
        for (const item of result.data) {
          const w = item as any;
          await db.words.upsert({
            id: w.id,
            character: w.character,
            pinyin: w.pinyin,
            translation: w.translation,
            hskLevel: w.hskLevel,
            audioUrl: w.audioUrl ?? null,
            mnemonic: w.mnemonic ?? null,
            createdAt: w.createdAt ?? new Date().toISOString(),
            examples: w.examples ?? [],
          });
        }
      }
      return result;
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

/**
 * Хук для получения последних N изученных слов текущего пользователя
 * (PLAN_Features_v0.3 §17). Возвращает плоский массив `WordListItem[]`,
 * отсортированный по `lastReviewDate DESC`.
 *
 * Параллельно зеркалит слова в локальный RxDB, чтобы офлайн-список
 * «Последние слова» мог работать без сети. Сами по себе `lastReviewDate`
 * обновляются через `useRecordAnswer → invalidateQueries(['words'])`
 * (prefix-match в react-query v5), но для надёжности ключ вынесен в
 * отдельный sub-prefix `['words', 'recent', limit]`, и в `sessions.ts`
 * инвалидация этого префикса вызывается явно.
 */
export function useRecentWords(limit = 10) {
  return useQuery({
    queryKey: ['words', 'recent', limit],
    queryFn: async () => {
      const result = await apiGet<WordListItem[]>(`/words/recent?limit=${limit}`);
      const db = getDb();
      if (db) {
        for (const w of result) {
          await db.words.upsert({
            id: w.id,
            character: w.character,
            pinyin: w.pinyin,
            translation: w.translation,
            hskLevel: w.hskLevel,
            audioUrl: null,
            mnemonic: null,
            createdAt: new Date().toISOString(),
            examples: [],
          });
        }
      }
      return result;
    },
  });
}
