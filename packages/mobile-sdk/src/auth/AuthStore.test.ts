import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAuthStore,
  getAuthGeneration,
  isSessionExpiredHandled,
  markSessionExpiredHandled,
} from './AuthStore';
import { setTokenStore, createDefaultTokenStore, getTokenStore } from './TokenStore';
import { setSecureStorage, getSecureStorage } from '../storage/SecureStorage';
import type { AuthResponse } from '@hanzi/shared';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const ACCESS_TOKEN_KEY = 'hanzi:auth:access';

describe('createAuthStore', () => {
  beforeEach(() => {
    setSecureStorage(new MemoryStorage() as never);
    setTokenStore(createDefaultTokenStore());
  });

  it('persists the access token synchronously on setAccessToken — no race with hydrateAuth (PLAN_Features_v0.4 §52)', () => {
    const store = createAuthStore();
    store.getState().setAccessToken('tok-1');
    // Persist обязан завершиться до возврата из setAccessToken:
    // readPersistedAccessToken() на следующем hydrateAuth не должен
    // увидеть старый/отсутствующий токен.
    expect(getSecureStorage().getItem(ACCESS_TOKEN_KEY)).toBe('tok-1');
    expect(getTokenStore().getAccessToken()).toBe('tok-1');
  });

  it('login persists the access token before returning', () => {
    const store = createAuthStore();
    store
      .getState()
      .login(
        { id: '11111111-1111-1111-1111-111111111111', email: 'a@b.ru', xp: 0, currentStreak: 0 },
        'tok-2',
        'rt-1',
      );
    expect(getSecureStorage().getItem(ACCESS_TOKEN_KEY)).toBe('tok-2');
    expect(store.getState().isAuthenticated).toBe(true);
  });

  it('F07: logout вызывает onLogout-хук (хост чистит очередь/курсор)', () => {
    const onLogout = vi.fn();
    const store = createAuthStore({ onLogout });
    store
      .getState()
      .login(
        { id: '22222222-2222-2222-2222-222222222222', email: 'b@b.ru', xp: 0, currentStreak: 0 },
        'tok-3',
      );
    expect(onLogout).not.toHaveBeenCalled();
    store.getState().logout();
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(store.getState().isAuthenticated).toBe(false);
  });

  it('F09: logout инкрементирует поколение — in-flight refresh не восстановит сессию', () => {
    const store = createAuthStore();
    store
      .getState()
      .login(
        { id: '33333333-3333-3333-3333-333333333333', email: 'c@c.ru', xp: 0, currentStreak: 0 },
        'tok-4',
      );
    const genBefore = getAuthGeneration();
    store.getState().logout();
    expect(getAuthGeneration()).toBe(genBefore + 1);
  });

  it('F09: login сбрасывает флаг идемпотентности — следующий expire снова сделает logout', () => {
    const store = createAuthStore();
    const user = {
      id: '44444444-4444-4444-4444-444444444444',
      email: 'd@d.ru',
      xp: 0,
      currentStreak: 0,
    };
    markSessionExpiredHandled();
    expect(isSessionExpiredHandled()).toBe(true);
    store.getState().login(user, 'tok-5');
    expect(isSessionExpiredHandled()).toBe(false);
  });

  it('F09: hydrateAuth, резолвнувшийся после logout, не восстанавливает сессию', async () => {
    const store = createAuthStore();
    const late: AuthResponse = {
      user: {
        id: '55555555-5555-5555-5555-555555555555',
        email: 'e@e.ru',
        xp: 0,
        currentStreak: 0,
      },
      accessToken: 'late-token',
      expiresIn: 900,
    };
    let resolveRefresh!: (r: AuthResponse | null) => void;
    const deferred = new Promise<AuthResponse | null>((res) => {
      resolveRefresh = res;
    });

    const hydrate = store.getState().hydrateAuth(() => deferred);
    // logout пока hydrate-запрос летит
    store.getState().logout();
    resolveRefresh(late);

    await hydrate;
    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().accessToken).toBeNull();
    expect(getTokenStore().getAccessToken()).toBeNull();
  });
});
