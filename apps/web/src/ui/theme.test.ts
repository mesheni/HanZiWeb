// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  type Theme,
  THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isLightTheme,
  isDarkTheme,
} from './theme';

describe('theme (pure)', () => {
  it('THEMES содержит dark и light', () => {
    expect(THEMES).toEqual(['dark', 'light']);
  });

  it('DEFAULT_THEME — dark', () => {
    expect(DEFAULT_THEME).toBe('dark');
  });

  it('THEME_STORAGE_KEY — hanzi:theme', () => {
    expect(THEME_STORAGE_KEY).toBe('hanzi:theme');
  });

  it('isLightTheme / isDarkTheme', () => {
    expect(isLightTheme('light')).toBe(true);
    expect(isLightTheme('dark')).toBe(false);
    expect(isDarkTheme('dark')).toBe(true);
    expect(isDarkTheme('light')).toBe(false);
  });

  it('тип Theme принимает только dark|light', () => {
    const dark: Theme = 'dark';
    const light: Theme = 'light';
    expect([dark, light].sort()).toEqual(['dark', 'light']);
  });
});

