import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../api/client';
import type {
  FullSession,
  StartSession,
  RecordAnswer,
  UserAchievement,
} from '@hanzi/shared';

/**
 * Ответ сервера на запись ответа: SRS-результат + разблокированные
 * достижения. Поле `unlockedAchievements` может быть пустым массивом.
 */
export interface RecordAnswerResponse {
  wordId: string;
  newStability: number;
  newDifficulty: number;
  newState: string;
  newDueDate: string;
  intervalDays: number;
  xpGain: number;
  unlockedAchievements: UserAchievement[];
}

/**
 * Хук для старта новой учебной сессии.
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
 * Возвращает `RecordAnswerResponse` со списком только что
 * разблокированных достижений.
 */
export function useRecordAnswer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordAnswer) =>
      apiPost<RecordAnswerResponse>(`/sessions/${input.sessionId}/answer`, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['words'] });
      if (data.unlockedAchievements.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['achievements'] });
      }
    },
  });
}
