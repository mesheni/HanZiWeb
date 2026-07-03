/**
 * React-хук для текущей темы.
 *
 * Вынесен в отдельный модуль, чтобы разорвать цикл:
 * `theme.ts` ↔ `stores/uiStore.ts`.
 */

import { useUiStore } from '@/stores/uiStore';
import { type Theme } from './theme';

export interface UseThemeResult {
  theme: Theme;
  isDark: boolean;
  isLight: boolean;
  toggle: () => void;
  setTheme: (next: Theme) => void;
}

export function useTheme(): UseThemeResult {
  const theme = useUiStore((s) => s.theme);
  const toggle = useUiStore((s) => s.toggleTheme);
  const setTheme = useUiStore((s) => s.setTheme);
  return {
    theme,
    isDark: theme === 'dark',
    isLight: theme === 'light',
    toggle,
    setTheme,
  };
}
