import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../api/client';
import type {
  Example,
  CreateExample,
  FetchExamplesResult,
  RecordCloze,
} from '@hanzi/shared';

/** Список примеров для одного слова. */
export function useWordExamples(wordId: string | null | undefined) {
  return useQuery({
    queryKey: ['word-examples', wordId],
    queryFn: () => apiGet<Example[]>(`/words/${wordId}/examples`),
    enabled: !!wordId,
    staleTime: 60_000,
  });
}

/** Ручное добавление примера. */
export function useCreateExample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { wordId: string; body: CreateExample }) =>
      apiPost<Example>(`/words/${input.wordId}/examples`, input.body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['word-examples', vars.wordId] });
    },
  });
}

/** Удаление примера. */
export function useDeleteExample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { wordId: string; exampleId: string }) =>
      apiDelete<void>(`/words/${input.wordId}/examples/${input.exampleId}`),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['word-examples', vars.wordId] });
    },
  });
}

/** Стрим-импорт из Tatoeba. */
export function useFetchTatoebaExamples() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { wordId: string; limit?: number }) => {
      const limit = input.limit ?? 3;
      return apiPost<FetchExamplesResult>(
        `/words/${input.wordId}/examples/fetch?limit=${limit}`,
      );
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['word-examples', vars.wordId] });
    },
  });
}

/** Запись cloze-попытки. */
export function useRecordClozeAttempt() {
  return useMutation({
    mutationFn: (input: RecordCloze) =>
      apiPost<{ exampleId: string; correctCount: number; wrongCount: number }>(
        '/cloze/attempts',
        input,
      ),
  });
}
