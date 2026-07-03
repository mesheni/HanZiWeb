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

export type LeaderboardPeriod = 'week' | 'all';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  xp: number;
  currentStreak: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  total: number;
  entries: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
  windowStart: string | null;
  windowEnd: string | null;
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

/**
 * Хук для leaderboard (`GET /stats/leaderboard?period=...`).
 * См. PLAN_Features_v0.2 §7.
 */
export function useLeaderboard(period: LeaderboardPeriod) {
  return useQuery({
    queryKey: ['stats', 'leaderboard', period],
    queryFn: () => apiGet<LeaderboardResponse>(`/stats/leaderboard?period=${period}`),
    staleTime: 60_000, // 1 мин — топ редко меняется, но свежесть важна.
  });
}
