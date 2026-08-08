import { QueryClient } from '@tanstack/react-query';

/**
 * Единый QueryClient приложения. Вынесен в модуль, чтобы logout
 * (authStore) мог очищать кэш при смене аккаунта (F07) — чужие данные
 * (слова, прогресс, статистика) не должны пережить выход.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
