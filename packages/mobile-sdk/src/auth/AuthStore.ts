import { create } from 'zustand';
import type { AuthResponse } from '@hanzi/shared';
import {
  applyAuthResponse,
  clearAuth as clearTokens,
  getTokenStore,
  readPersistedAccessToken,
} from './TokenStore';
import { getSecureStorage } from '../storage/SecureStorage';

export interface AuthUser {
  id: string;
  email: string;
  xp: number;
  currentStreak: number;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  /** Last error from `login`/`register`/`hydrate`. */
  lastError: string | null;

  login(user: AuthUser, accessToken: string, refreshToken?: string | null): void;
  logout(): void;
  setAccessToken(token: string | null): void;
  hydrateAuth(doRefresh: () => Promise<AuthResponse | null>): Promise<void>;
  setError(message: string | null): void;
}

export interface AuthStoreOptions {
  /**
   * F07: вызывается при logout (fire-and-forget) — хост чистит
   * локальное состояние аккаунта (очередь/курсор), чтобы чужие ответы
   * не пережили смену аккаунта.
   */
  onLogout?: () => void;
}

/**
 * Поколение авторизации (F09, как fix v0.4 §5 на web). Инкрементируется
 * при каждом logout: любой in-flight refresh/hydrate, стартовавший ДО
 * logout, после резолва видит устаревшее поколение и не восстанавливает
 * сессию — «Выйти» окончателен.
 */
let authGeneration = 0;

export function getAuthGeneration(): number {
  return authGeneration;
}

/** Инвалидирует все in-flight refresh/hydrate. Вызывается в `logout()`. */
export function bumpAuthGeneration(): number {
  authGeneration += 1;
  return authGeneration;
}

/**
 * Идемпотентность onSessionExpired (F09, как fix v0.4 §9 на web):
 * при N конкурентных 401 после проваленного refresh каждый ожидающий
 * запрос зовёт onSessionExpired. Флаг берётся синхронно при входе —
 * ровно один silent-refresh и ровно один logout-флоу на пачку.
 * Сбрасывается при успешном login / hydrate.
 */
let sessionExpiredHandled = false;

export function isSessionExpiredHandled(): boolean {
  return sessionExpiredHandled;
}

export function markSessionExpiredHandled(): void {
  sessionExpiredHandled = true;
}

export function resetSessionExpiredHandled(): void {
  sessionExpiredHandled = false;
}

export const createAuthStore = (options: AuthStoreOptions = {}) =>
  create<AuthState>((set) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isHydrating: true,
    lastError: null,

    login: (user, accessToken, refreshToken) => {
      // Новая сессия — следующий реальный expire снова сможет logout (F09).
      resetSessionExpiredHandled();
      applyAuthResponse({ user, accessToken, expiresIn: 900 }, refreshToken ?? null);
      set({ user, accessToken, isAuthenticated: true, lastError: null });
    },

    logout: () => {
      // Инвалидируем in-flight refresh/hydrate: их резолвы после этого
      // увидят новое поколение и не восстановят сессию (F09, §5).
      bumpAuthGeneration();
      clearTokens();
      set({ user: null, accessToken: null, isAuthenticated: false, isHydrating: false });
      try {
        options.onLogout?.();
      } catch {
        // Хук не должен ломать logout.
      }
    },

    setAccessToken: (accessToken) => {
      getTokenStore().setAccessToken(accessToken);
      if (accessToken) {
        // Mirror into SecureStorage so a hard reload can hydrate.
        // (applyAuthResponse does the same on the happy path.)
        //
        // Persist СИНХРОННО: fire-and-forget dynamic import раньше не
        // await'ился — следующий readPersistedAccessToken() (hydrateAuth
        // на перезапуске) мог прочитать старый токен, а на RN
        // динамический import мог упасть без catch
        // (PLAN_Features_v0.4 §52).
        try {
          getSecureStorage().setItem('hanzi:auth:access', accessToken);
        } catch {
          // Хранилище не зарегистрировано — токен живёт в памяти.
        }
      }
      set({ accessToken });
    },

    hydrateAuth: async (doRefresh) => {
      const existing = readPersistedAccessToken();
      if (existing) {
        getTokenStore().setAccessToken(existing);
        set({ accessToken: existing });
      }

      const gen = getAuthGeneration();
      const result = await doRefresh();
      // logout случился во время hydrate — сессию не восстанавливаем
      // (isHydrating уже сброшен в logout(), F09 §5).
      if (gen !== getAuthGeneration()) return;
      if (result) {
        resetSessionExpiredHandled();
        applyAuthResponse(result, getTokenStore().getRefreshToken());
        set({
          user: result.user,
          accessToken: result.accessToken,
          isAuthenticated: true,
          isHydrating: false,
        });
      } else {
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isHydrating: false,
        });
      }
    },

    setError: (message) => set({ lastError: message }),
  }));
