import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export interface Overview {
  xp: number;
  currentStreak: number;
  totalWords: number;
  learnedWords: number;
  accuracy: number;
  byState: {
    new: number;
    learning: number;
    review: number;
    graduated: number;
  };
}

export interface ActivityDay {
  date: string;
  count: number;
}

export interface Dashboard {
  streak: number;
  wordsDueToday: number;
  wordsLearned: number;
  totalReviews: number;
  xp: number;
}

/**
 * Хук для общей статистики.
 */
export function useOverview() {
  return useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => apiGet<Overview>('/stats/overview'),
  });
}

/**
 * Хук для дашборда (главная страница).
 */
export function useDashboard() {
  return useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => apiGet<Dashboard>('/stats/dashboard'),
  });
}

/**
 * Хук для календаря активности (год).
 */
export function useActivity(year: number) {
  return useQuery({
    queryKey: ['stats', 'activity', year],
    queryFn: () => apiGet<ActivityDay[]>(`/stats/activity?year=${year}`),
  });
}

/**
 * Хук для получения/обновления daily streak.
 */
export function useStreak() {
  return useQuery({
    queryKey: ['stats', 'streak'],
    queryFn: () => apiGet<{ currentStreak: number; lastActiveDate: string | null }>('/stats/streak'),
  });
}
