import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DAILY_GOAL_DEFAULT,
  type ProgressExport,
  type ProgressImportMode,
  type ProgressImportResponse,
} from '@hanzi/shared';
import { apiGet, apiGetBlob, apiPost, apiPut, downloadBlob } from '../api/client';

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
  todayReviews: number;
  dailyGoal: number;
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
 * Пользовательские настройки (ежедневная цель и т.п.).
 * См. PLAN_Features_v0.2 §9.
 */
export interface UserSettings {
  dailyGoal: number;
}

/** Хук для чтения пользовательских настроек. */
export function useUserSettings() {
  return useQuery({
    queryKey: ['users', 'settings'],
    queryFn: () => apiGet<UserSettings>('/users/settings'),
    // Пока только `dailyGoal` — раз в минуту достаточно.
    staleTime: 60_000,
  });
}

/**
 * Хук для обновления пользовательских настроек.
 * Инвалидирует связанные ключи (`['users', 'settings']`,
 * `['stats', 'dashboard']`) на успех, чтобы UI обновился.
 */
export function useUpdateUserSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserSettings>) =>
      apiPut<UserSettings>('/users/settings', patch),
    onSuccess: (data) => {
      qc.setQueryData<UserSettings>(['users', 'settings'], data);
      qc.invalidateQueries({ queryKey: ['stats', 'dashboard'] });
    },
  });
}

/** Дефолт, если сервер ещё не ответил. */
export const DAILY_GOAL_FALLBACK = DAILY_GOAL_DEFAULT;

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

// ─── Экспорт/импорт прогресса (PLAN_Features_v0.2 §10) ─────────────

/** Формат экспорта: `json` или `csv`. */
export type ProgressExportFormat = 'json' | 'csv';

/** Скачивает файл экспорта через `GET /stats/export?format=...`. */
export async function downloadProgressExport(format: ProgressExportFormat): Promise<void> {
  const blob = await apiGetBlob(`/stats/export?format=${format}`);
  const ext = format === 'csv' ? 'csv' : 'json';
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `hanzi-progress-${stamp}.${ext}`);
}

/**
 * Импортирует прогресс из JSON-бэкапа.
 * Принимает уже распарсенный объект `ProgressExport` или просто
 * массив `ProgressRecord[]` (для обратной совместимости).
 */
export function useImportProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      mode: ProgressImportMode;
      payload: ProgressExport | { progress: ProgressExport['progress'] };
    }) => {
      const progress = Array.isArray((input.payload as ProgressExport).progress)
        ? (input.payload as ProgressExport).progress
        : (input.payload as { progress: ProgressExport['progress'] }).progress;
      return apiPost<ProgressImportResponse>('/stats/import', {
        mode: input.mode,
        progress,
      });
    },
    onSuccess: () => {
      // Прогресс мог поменяться — обновляем все связанные ключи.
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['words'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
