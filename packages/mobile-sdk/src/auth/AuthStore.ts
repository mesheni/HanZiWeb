import { create } from 'zustand';
import type { AuthResponse } from '@hanzi/shared';
import {
  applyAuthResponse,
  clearAuth as clearTokens,
  getTokenStore,
  readPersistedAccessToken,
} from './TokenStore';

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

export const createAuthStore = () =>
  create<AuthState>((set) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isHydrating: true,
    lastError: null,

    login: (user, accessToken, refreshToken) => {
      applyAuthResponse({ user, accessToken, expiresIn: 900 }, refreshToken ?? null);
      set({ user, accessToken, isAuthenticated: true, lastError: null });
    },

    logout: () => {
      clearTokens();
      set({ user: null, accessToken: null, isAuthenticated: false });
    },

    setAccessToken: (accessToken) => {
      getTokenStore().setAccessToken(accessToken);
      if (accessToken) {
        // Mirror into SecureStorage so a hard reload can hydrate.
        // (applyAuthResponse does the same on the happy path.)
        import('../storage/SecureStorage').then(({ getSecureStorage }) => {
          getSecureStorage().setItem('hanzi:auth:access', accessToken);
        });
      }
      set({ accessToken });
    },

    hydrateAuth: async (doRefresh) => {
      const existing = readPersistedAccessToken();
      if (existing) {
        getTokenStore().setAccessToken(existing);
        set({ accessToken: existing });
      }

      const result = await doRefresh();
      if (result) {
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
