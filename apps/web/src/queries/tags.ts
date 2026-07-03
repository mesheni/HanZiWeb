import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import type { Tag, SetWordTags, CreateTag } from '@hanzi/shared';

/** Расширенный тег с количеством слов (возвращается из GET /tags). */
export interface TagWithCount extends Tag {
  wordCount: number;
}

/** Список всех тегов с подсчётом слов. */
export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => apiGet<TagWithCount[]>('/tags'),
    staleTime: 60_000,
  });
}

/** Создать тег. */
export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTag) => apiPost<Tag>('/tags', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

/** Удалить тег. */
export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: string }>(`/tags/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

/** Заменить набор тегов слова. */
export function useSetWordTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { wordId: string; body: SetWordTags }) =>
      apiPut<Tag[]>(`/tags/words/${input.wordId}/tags`, input.body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['tags'] });
      void qc.invalidateQueries({ queryKey: ['words', vars.wordId] });
    },
  });
}
