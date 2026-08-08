import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAuthStore } from './AuthStore';
import { setTokenStore, createDefaultTokenStore, getTokenStore } from './TokenStore';
import { setSecureStorage, getSecureStorage } from '../storage/SecureStorage';

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
});
