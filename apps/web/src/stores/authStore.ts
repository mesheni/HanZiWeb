import { create } from 'zustand';
import type { AuthResponse } from '@hanzi/shared';

interface User {
  id: string;
  email: string;
  xp: number;
  currentStreak: number;
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
  /**
   * Пробует silent refresh через httpOnly cookie. Возвращает `true`, если
   * новый access-токен получен и записан в стор; `false` если refresh
   * не удался (сеть / истёк refresh-токен). При успехе НЕ трогает `user`.
   * Используется в `onSessionExpired` и `apiClient` для повторной попытки
   * вместо немедленного logout.
   */
  silentRefresh: () => Promise<boolean>;
  /**
   * Обработчик «сессия истекла» (PLAN_Features_v0.3 §15). Сначала пробует
   * {@link silentRefresh} — если refresh удалось, возвращает `true`
   * (вызывающий код может повторить исходный запрос). Только если
   * refresh тоже упал — делает logout. Так избегаем «выкидывания» юзера
   * из аккаунта при кратковременном обрыве сети / блипе.
   */
  onSessionExpired: () => Promise<boolean>;
}

let hydratePromise: Promise<void> | null = null;

/**
 * Fire-and-forget уведомление сервера о выходе: `POST /auth/logout`
 * инвалидирует refresh-токен и чистит httpOnly cookie. Без этого после
 * «Выйти» `hydrateAuth()` тихо логинил бы пользователя обратно
 * (PLAN_Features_v0.4 §5).
 */
async function notifyServerLogout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Сеть недоступна — локальный logout всё равно состоится.
  }
}

/** Сносит SW-кэш API, чтобы чужие ответы не пережили смену аккаунта. */
function clearApiCache(): void {
  if (typeof caches === 'undefined') return;
  caches.delete('api-cache').catch(() => {});
}

async function doSilentRefresh(): Promise<{ user: User; accessToken: string } | null> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: AuthResponse };
    if (!json.success || !json.data?.accessToken || !json.data?.user) return null;
    return { user: json.data.user, accessToken: json.data.accessToken };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isHydrating: true,

  login: (user, accessToken) =>
    set({ user, accessToken, isAuthenticated: true }),

  logout: () => {
    void notifyServerLogout();
    clearApiCache();
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  setAccessToken: (accessToken) => set({ accessToken }),

  silentRefresh: async () => {
    const result = await doSilentRefresh();
    if (!result) return false;
    set({
      user: result.user,
      accessToken: result.accessToken,
      isAuthenticated: true,
    });
    return true;
  },

  onSessionExpired: async () => {
    const recovered = await get().silentRefresh();
    if (recovered) return true;
    get().logout();
    return false;
  },

  hydrateAuth: async () => {
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      const result = await doSilentRefresh();
      if (!result) {
        set({ user: null, accessToken: null, isAuthenticated: false, isHydrating: false });
        return;
      }
      set({
        user: result.user,
        accessToken: result.accessToken,
        isAuthenticated: true,
        isHydrating: false,
      });
    })().finally(() => {
      hydratePromise = null;
    });

    return hydratePromise;
  },
}));
