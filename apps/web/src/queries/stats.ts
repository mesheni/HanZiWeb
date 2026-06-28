import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

interface Overview {
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

interface ActivityDay {
  day: number;
  count: number;
}

/**
 * Хук для общей статистики.
 * TODO: подключить к реальному API когда бэкенд будет готов.
 */
export function useOverview() {
  return useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => apiGet<Overview>('/stats/overview'),
    enabled: false,
  });
}

/**
 * Хук для календаря активности.
 */
export function useActivity(year: number, month: number) {
  return useQuery({
    queryKey: ['stats', 'activity', year, month],
    queryFn: () => apiGet<ActivityDay[]>(`/stats/activity?year=${year}&month=${month}`),
    enabled: false,
  });
}
