import { useMutation, useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api/client';
import type { StartTest, SubmitTest, TestResult, TestSession } from '@hanzi/shared';

/**
 * Хук для старта нового теста (POST /api/tests/start).
 * Возвращает `useMutation`, в `mutate({ level })` — TestSession.
 */
export function useStartTest() {
  return useMutation({
    mutationFn: async (input: StartTest) => apiPost<TestSession>('/tests/start', input),
  });
}

/**
 * Хук для сабмита ответов (POST /api/tests/:id/submit).
 * Возвращает `useMutation`, в `mutate({ testId, body })` — TestResult.
 */
export function useSubmitTest() {
  return useMutation({
    mutationFn: async (input: { testId: string; body: SubmitTest }) =>
      apiPost<TestResult>(`/tests/${input.testId}/submit`, input.body),
  });
}

/**
 * Хук для получения истории тестов (GET /api/tests/history).
 * По умолчанию — 20 последних результатов.
 */
export function useTestHistory(limit = 20) {
  return useQuery({
    queryKey: ['tests', 'history', limit],
    queryFn: () => apiGet<TestResult[]>(`/tests/history?limit=${limit}`),
    staleTime: 30_000,
  });
}
