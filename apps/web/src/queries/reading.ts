import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api/client';
import type { ReadingTextListItem, ReadingTextDetail } from '@hanzi/shared';

export function useReadingTexts(hskLevel?: number) {
  return useQuery({
    queryKey: ['reading', 'texts', hskLevel ?? 'all'],
    queryFn: () => apiGet<ReadingTextListItem[]>(`/reading/texts${hskLevel ? `?hskLevel=${hskLevel}` : ''}`),
    staleTime: 60_000,
  });
}

export function useReadingText(id: string) {
  return useQuery({
    queryKey: ['reading', 'text', id],
    queryFn: () => apiGet<ReadingTextDetail>(`/reading/texts/${id}`),
    enabled: !!id,
  });
}

export function useAddPriorityWords(textId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wordIds: string[]) =>
      apiPost<{ added: number }>(`/reading/texts/${textId}/priority-words`, { wordIds }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reading', 'text', textId] });
    },
  });
}

export function useMarkTextRead(textId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<void>(`/reading/texts/${textId}/progress`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reading', 'text', textId] });
      void qc.invalidateQueries({ queryKey: ['reading', 'texts'] });
    },
  });
}
