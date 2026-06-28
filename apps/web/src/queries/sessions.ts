import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../api/client';
import type { FullSession, StartSession, RecordAnswer } from '@hanzi/shared';

/**
 * Хук для старта новой учебной сессии.
 * TODO: подключить к реальному API когда бэкенд будет готов.
 */
export function useStartSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartSession) => apiPost<FullSession>('/sessions/start', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

/**
 * Хук для записи ответа на карточку.
 */
export function useRecordAnswer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordAnswer) => apiPost(`/sessions/${input.sessionId}/answer`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['words'] });
    },
  });
}
