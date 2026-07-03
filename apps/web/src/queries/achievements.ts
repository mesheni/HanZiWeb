import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { UserAchievement, UserAchievementsResponse } from '@hanzi/shared';

export type { UserAchievement, UserAchievementsResponse };

/**
 * Хук списка разблокированных достижений пользователя.
 * См. PLAN_Features_v0.2 §8.
 */
export function useAchievements() {
  return useQuery({
    queryKey: ['achievements'],
    queryFn: () => apiGet<UserAchievementsResponse>('/achievements'),
    staleTime: 30_000,
  });
}
