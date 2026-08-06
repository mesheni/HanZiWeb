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
 * Поколение авторизации. Инкрементируется при каждом logout: любой
 * in-flight refresh/hydrate, стартовавший ДО logout, после резолва видит
 * устаревшее поколение и не восстанавливает сессию — «Выйти» окончателен
 * (fix v0.4 §5 follow-up).
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
 * Идемпотентность `onSessionExpired` (fix v0.4 §9 follow-up): при N
 * конкурентных 401 после проваленного refresh каждый ожидающий запрос
 * зовёт `onSessionExpired`. Флаг берётся синхронно при входе — ровно
 * один silent-refresh и ровно один logout-флоу на пачку. Сбрасывается
 * при успешном login / hydrate / silentRefresh.
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

  login: (user, accessToken) => {
    // Новая сессия — следующий реальный expire снова сможет logout.
    resetSessionExpiredHandled();
    set({ user, accessToken, isAuthenticated: true });
  },

  logout: () => {
    // Инвалидируем in-flight refresh/hydrate: их резолвы после этого
    // увидят новое поколение и не восстановят сессию.
    bumpAuthGeneration();
    void notifyServerLogout();
    clearApiCache();
    set({ user: null, accessToken: null, isAuthenticated: false, isHydrating: false });
  },

  setAccessToken: (accessToken) => set({ accessToken }),

  silentRefresh: async () => {
    // Уже разлогинены (явный logout) — молча выходим.
    if (!get().isAuthenticated) return false;
    const gen = getAuthGeneration();
    const result = await doSilentRefresh();
    // logout случился, пока летел запрос — не восстанавливаем сессию.
    if (!result || gen !== getAuthGeneration()) return false;
    resetSessionExpiredHandled();
    set({
      user: result.user,
      accessToken: result.accessToken,
      isAuthenticated: true,
    });
    return true;
  },

  onSessionExpired: async () => {
    // Пачка конкурентных 401: первый вызов забирает флаг синхронно,
    // остальные выходят сразу — один silentRefresh, один logout.
    if (isSessionExpiredHandled()) return false;
    markSessionExpiredHandled();
    const recovered = await get().silentRefresh();
    if (recovered) return true; // silentRefresh сбросил флаг
    // Явный logout уже снял isAuthenticated — не дублируем logout-флоу.
    if (get().isAuthenticated) {
      get().logout();
    }
    return false;
  },

  hydrateAuth: async () => {
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      const gen = getAuthGeneration();
      const result = await doSilentRefresh();
      // logout случился во время hydrate — сессию не восстанавливаем
      // (isHydrating уже сброшен в logout()).
      if (gen !== getAuthGeneration()) return;
      if (!result) {
        set({ user: null, accessToken: null, isAuthenticated: false, isHydrating: false });
        return;
      }
      resetSessionExpiredHandled();
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
