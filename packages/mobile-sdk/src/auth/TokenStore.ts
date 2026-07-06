import type { AuthResponse } from '@hanzi/shared';
import { getSecureStorage } from '../storage/SecureStorage';

/**
 * Persists the short-lived access token. The refresh token has its own
 * lifecycle: on web it lives in an HttpOnly cookie set by the server, on
 * mobile it must be stored in `SecureStorage` (Keychain / Keystore
 * behind the scenes) and sent as a `Bearer` header.
 *
 * Both web and mobile therefore need the same `setRefreshToken`/
 * `getRefreshToken` API — the only difference is *where* the underlying
 * bytes are persisted.
 */
export interface TokenStore {
  /** Read the access token (or `null` if the user is signed out). */
  getAccessToken(): string | null;
  /** Persist the access token in memory (or in any client cache). */
  setAccessToken(token: string | null): void;

  /**
   * Read the refresh token. On web this returns `null` because the
   * server keeps it in an HttpOnly cookie. On mobile this returns the
   * token previously written by {@link setRefreshToken}.
   */
  getRefreshToken(): string | null;
  /** Persist the refresh token (mobile only — web is a no-op). */
  setRefreshToken(token: string | null): void;
}

let activeTokenStore: TokenStore | null = null;

export function setTokenStore(store: TokenStore): void {
  activeTokenStore = store;
}

export function getTokenStore(): TokenStore {
  if (!activeTokenStore) {
    throw new Error(
      'No TokenStore registered. Call setTokenStore() at app startup.',
    );
  }
  return activeTokenStore;
}

/* ─── Standard token-store key names (shared with `apps/web`) ──────── */

const ACCESS_TOKEN_KEY = 'hanzi:auth:access';
const REFRESH_TOKEN_KEY = 'hanzi:auth:refresh';

/* ─── Per-instance memory cell ──────────────────────────────────────── */

interface MemoryCell<T> {
  value: T;
}

function createMemoryCell<T>(initial: T): MemoryCell<T> {
  return { value: initial };
}

/**
 * Default token store: access token in module-scope memory (so a page
 * reload clears it and forces a refresh), refresh token in
 * `SecureStorage` (works for both `localStorage` and MMKV).
 *
 * Each call returns a fresh store with its own memory cell — important
 * for tests that want isolated state, and harmless in production (every
 * call to `createDefaultTokenStore` produces an equivalent store).
 */
export function createDefaultTokenStore(): TokenStore {
  const cell = createMemoryCell<string | null>(null);
  return {
    getAccessToken: () => cell.value,
    setAccessToken: (token) => {
      cell.value = token;
    },
    getRefreshToken: () => getSecureStorage().getItem(REFRESH_TOKEN_KEY),
    setRefreshToken: (token) => {
      const storage = getSecureStorage();
      if (token === null) storage.removeItem(REFRESH_TOKEN_KEY);
      else storage.setItem(REFRESH_TOKEN_KEY, token);
    },
  };
}

/** Apply an `AuthResponse` to the store in one call. */
export function applyAuthResponse(response: AuthResponse, refreshToken?: string | null): void {
  const store = getTokenStore();
  store.setAccessToken(response.accessToken);
  if (refreshToken) {
    store.setRefreshToken(refreshToken);
  }
  // Stash the access token in SecureStorage too so it survives a hard
  // reload when `hydrateAuth()` is called before the in-memory store is
  // populated.
  const storage = getSecureStorage();
  if (response.accessToken) {
    storage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
  } else {
    storage.removeItem(ACCESS_TOKEN_KEY);
  }
}

export function clearAuth(): void {
  const store = getTokenStore();
  store.setAccessToken(null);
  store.setRefreshToken(null);
  const storage = getSecureStorage();
  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
}

export function readPersistedAccessToken(): string | null {
  return getSecureStorage().getItem(ACCESS_TOKEN_KEY);
}
