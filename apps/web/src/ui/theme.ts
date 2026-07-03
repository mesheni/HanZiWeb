/**
 * Тема оформления приложения.
 *
 * Палитра живёт в `src/styles/global.css` под селекторами
 * `:root[data-theme="dark"]` и `:root[data-theme="light"]`.
 * Этот модуль лишь:
 *   - фиксирует допустимые значения темы,
 *   - применяет выбранную тему к `<html data-theme="...">`,
 *   - предоставляет утилиты `isLightTheme` / `isDarkTheme`.
 *
 * Хук для компонентов живёт в `./useTheme.ts` — это разрывает
 * циклическую зависимость theme ↔ uiStore.
 */

export type Theme = 'dark' | 'light';

export const THEMES: readonly Theme[] = ['dark', 'light'] as const;

export const DEFAULT_THEME: Theme = 'dark';

export const THEME_STORAGE_KEY = 'hanzi:theme';

const DATA_ATTR = 'data-theme';

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // localStorage недоступен — падаем к дефолту.
  }
  if (typeof window.matchMedia === 'function') {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    if (prefersLight) return 'light';
  }
  return DEFAULT_THEME;
}

/**
 * Применяет тему к корневому элементу документа.
 * Возвращает фактически применённое значение (валидированное).
 */
export function applyTheme(theme: Theme): Theme {
  if (typeof document === 'undefined') return theme;
  const next: Theme = isTheme(theme) ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute(DATA_ATTR, next);
  document.documentElement.style.colorScheme = next;
  return next;
}

/**
 * Считывает текущую применённую тему из DOM.
 * Полезно для синхронизации до загрузки React-стора.
 */
export function getAppliedTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const attr = document.documentElement.getAttribute(DATA_ATTR);
  return isTheme(attr) ? attr : DEFAULT_THEME;
}

/** Персистит выбранную тему в localStorage (best-effort). */
export function persistTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Квота localStorage / приватный режим — тихо игнорируем.
  }
}

/**
 * Инициализация темы до маунта React: вычитывает сохранённое
 * значение (или системные настройки) и применяет к `<html>`.
 * Возвращает определённую тему.
 */
export function bootstrapTheme(): Theme {
  const theme = readInitialTheme();
  applyTheme(theme);
  return theme;
}

export function isLightTheme(theme: Theme): boolean {
  return theme === 'light';
}

export function isDarkTheme(theme: Theme): boolean {
  return theme === 'dark';
}
