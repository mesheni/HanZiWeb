/**
 * Mobile bootstrap. Wires the platform-specific adapters into
 * `@hanzi/mobile-sdk` and exports the singletons used by the rest of
 * the app (`api`, `sync`, `useAuthStore`, etc.).
 *
 * This file is the only place that reaches for `NetInfo`, `MMKV`, or
 * `expo-secure-store` directly — everything downstream consumes the
 * SDK's portable APIs.
 */
import NetInfo from '@react-native-community/netinfo';
import { MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import {
  ApiClient,
  SyncEngine,
  createDefaultTokenStore,
  createAuthStore,
  setNetworkAdapter,
  setSecureStorage,
  setTokenStore,
  type NetworkAdapter,
  type SecureStorage,
} from '@hanzi/mobile-sdk';
import type { AuthResponse } from '@hanzi/shared';

/* ─── MMKV-backed SecureStorage ──────────────────────────────────────── */

const mmkv = new MMKV();

const mmkvStorage: SecureStorage = {
  getItem(key) {
    return mmkv.getString(key) ?? null;
  },
  setItem(key, value) {
    mmkv.set(key, value);
  },
  removeItem(key) {
    mmkv.delete(key);
  },
};

/* ─── Optional SecureStore mirror for the refresh token ──────────────── */

const REFRESH_TOKEN_KEY = 'hanzi.auth.refresh';

/* ─── NetInfo-backed NetworkAdapter ──────────────────────────────────── */

const netInfoAdapter: NetworkAdapter = {
  isOnline() {
    return Boolean(NetInfo.fetch().then((s) => s.isConnected));
  },
  subscribe(listener) {
    const sub = NetInfo.addEventListener((state) => {
      listener(Boolean(state.isConnected));
    });
    return () => sub();
  },
};

/* ─── Wire up the SDK ────────────────────────────────────────────────── */

setSecureStorage(mmkvStorage);
setNetworkAdapter(netInfoAdapter);
const tokenStore = createDefaultTokenStore();
setTokenStore(tokenStore);

/**
 * Base URL of the HanZiWeb REST API. Reads from `process.env.EXPO_PUBLIC_API_URL`
 * (set at build time by Expo's Metro bundler). Falls back to the
 * public production endpoint so the bundle is never broken in dev.
 */
const apiBaseUrl =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  'https://api.hanzi.example.com';

const doRefresh = async (): Promise<AuthResponse | null> => {
  const refresh = tokenStore.getRefreshToken();
  if (!refresh) return null;
  const result = await api.post<AuthResponse & { refreshToken: string }>(
    '/auth/refresh',
    { refreshToken: refresh },
    { withRefreshToken: true },
  );
  if (!result.ok || !result.data) return null;
  tokenStore.setRefreshToken(result.data.refreshToken);
  return result.data;
};

export const api = new ApiClient({
  baseUrl: apiBaseUrl,
  refresh: doRefresh,
  onRefreshed: (response) => {
    tokenStore.setAccessToken(response.accessToken);
  },
  onSessionExpired: () => {
    tokenStore.setAccessToken(null);
    tokenStore.setRefreshToken(null);
    useAuthStore.getState().logout();
  },
});

export const useAuthStore = createAuthStore();

/* ─── Persistent queue: WatermelonDB (or fallback to MMKV) ──────────── */

/**
 * LocalStorage abstraction. The mobile app uses WatermelonDB tables
 * (`pending_changes`, `words`, `progress`) but the SDK only sees the
 * {@link QueueStorage} contract. The adapter is created lazily after
 * the database is opened by `App.tsx` (so we can show a splash screen
 * during the SQLite init). Until then, `sync` operates on a no-op
 * queue — answers given during the splash are kept in memory by
 * `useStudySession` and replayed once the queue is wired.
 */
import { createMemoryQueueStorage } from '@hanzi/mobile-sdk';
import type { QueueStorage } from '@hanzi/mobile-sdk';

let _queueStorage: QueueStorage = createMemoryQueueStorage();
let _sync: SyncEngine | null = null;

export function getQueueStorage(): QueueStorage {
  return _queueStorage;
}

export function setQueueStorage(storage: QueueStorage): void {
  _queueStorage = storage;
  if (_sync) {
    // Re-bind: tear down the old engine and create a new one so it
    // reads from the freshly-wired WatermelonDB collection.
    _sync.destroy();
    _sync = new SyncEngine({ api, storage: _queueStorage });
    _sync.start();
  }
}

export function getSync(): SyncEngine {
  if (!_sync) {
    _sync = new SyncEngine({ api, storage: _queueStorage });
    _sync.start();
  }
  return _sync;
}

/* ─── SecureStore helper for the refresh token (optional belt) ─────── */

export async function readSecureRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function writeSecureRefreshToken(value: string | null): Promise<void> {
  try {
    if (value === null) {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } else {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, value);
    }
  } catch {
    // SecureStore is optional — falling back to MMKV is fine.
  }
}
