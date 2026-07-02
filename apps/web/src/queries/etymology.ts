import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Etymology } from '@hanzi/shared';

/**
 * Хук для карточки этимологии иероглифа.
 *
 * Запрашивает `GET /api/words/:wordId/etymology`. Если слово не
 * найдено — придёт 404, и хук перейдёт в `isError`. Если данных
 * по самому иероглифу нет — `data.found === false` (UI покажет
 * заглушку).
 */
export function useWordEtymology(wordId: string | null | undefined) {
  return useQuery({
    queryKey: ['word-etymology', wordId],
    queryFn: () => apiGet<Etymology>(`/words/${wordId}/etymology`),
    enabled: !!wordId,
    staleTime: 24 * 60 * 60_000, // 1 день — словарь статичный.
    retry: (failureCount, err) => {
      // 404 — нет смысла ретраить.
      if (err instanceof Error && /404/.test(err.message)) return false;
      return failureCount < 2;
    },
  });
}
