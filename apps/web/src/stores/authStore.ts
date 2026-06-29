import { create } from 'zustand';
import type { AuthResponse } from '@hanzi/shared';

interface User {
  id: string;
  email: string;
  xp: number;
  currentStreak: number;
  subscriptionTier: 'free' | 'pro';
  subscriptionExpiresAt: string | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;

  // Actions
  login: (user: User, accessToken: string) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
  hydrateAuth: () => Promise<void>;
}

let hydratePromise: Promise<void> | null = null;

export function isPro(user: User | null): boolean {
  if (!user) return false;
  if (user.subscriptionTier !== 'pro') return false;
  if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) return false;
  return true;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isHydrating: true,

  login: (user, accessToken) =>
    set({ user, accessToken, isAuthenticated: true }),

  logout: () =>
    set({ user: null, accessToken: null, isAuthenticated: false }),

  setAccessToken: (accessToken) => set({ accessToken }),

  hydrateAuth: async () => {
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        set({ user: null, accessToken: null, isAuthenticated: false, isHydrating: false });
        return;
      }

      const json = (await res.json()) as { success?: boolean; data?: AuthResponse };
      if (!json.success || !json.data?.accessToken || !json.data?.user) {
        set({ user: null, accessToken: null, isAuthenticated: false, isHydrating: false });
        return;
      }

      set({
        user: json.data.user,
        accessToken: json.data.accessToken,
        isAuthenticated: true,
        isHydrating: false,
      });
    } catch {
      set({ user: null, accessToken: null, isAuthenticated: false, isHydrating: false });
    }
    })().finally(() => {
      hydratePromise = null;
    });

    return hydratePromise;
  },
}));
