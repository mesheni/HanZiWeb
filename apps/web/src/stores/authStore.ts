import { create } from 'zustand';

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

  // Actions
  login: (user: User, accessToken: string) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
}

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

  login: (user, accessToken) =>
    set({ user, accessToken, isAuthenticated: true }),

  logout: () =>
    set({ user: null, accessToken: null, isAuthenticated: false }),

  setAccessToken: (accessToken) => set({ accessToken }),
}));
