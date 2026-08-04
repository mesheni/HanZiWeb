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

// Кэшируем состояние: `NetInfo.fetch()` асинхронный, а NetworkAdapter
// требует синхронный snapshot. До фикса `isOnline()` возвращал
// `Boolean(Promise)` === true — SyncEngine считал устройство всегда
// онлайн и хаммерил сервер ретраями даже в оффлайне
// (PLAN_Features_v0.4 §44).
let cachedOnline = true;

const netInfoAdapter: NetworkAdapter = {
  isOnline() {
    return cachedOnline;
  },
  subscribe(listener) {
    const sub = NetInfo.addEventListener((state) => {
      cachedOnline = Boolean(state.isConnected);
      listener(cachedOnline);
    });
    // Best-effort seed текущего состояния (PLAN_Features_v0.4 §53):
    // некоторые версии NetInfo не стреляют addEventListener сразу с
    // актуальным состоянием, а SyncEngine.start() читает isOnline()
    // в момент подписки. Дёргаем fetch при подписке — кэш обновляется
    // как можно раньше; повторный listener-вызов идемпотентен.
    NetInfo.fetch()
      .then((s) => {
        cachedOnline = Boolean(s.isConnected);
        listener(cachedOnline);
      })
      .catch(() => {});
    return () => sub();
  },
};

// Стартовый snapshot: подписка NetInfo может сработать позже, а
// SyncEngine читает `isOnline()` сразу в `start()`. Кэш обновляем
// асинхронно; между стартом и первым событием считаем «онлайн»
// (см. §51) — безопаснее, чем блокировать flush при живом коннекте.
NetInfo.fetch().then((s) => {
  cachedOnline = Boolean(s.isConnected);
});

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
  const result = await api.post<AuthResponse>(
    '/auth/refresh',
    { refreshToken: refresh },
    { withRefreshToken: true },
  );
  if (!result.ok || !result.data) return null;
  // Сервер ротирует refresh-токен и отдаёт его в теле для mobile
  // (X-Client-Type: mobile, PLAN_Features_v0.4 §47). Если поле вдруг
  // отсутствует — сохраняем прежний, чтобы не потерять сессию.
  tokenStore.setRefreshToken(result.data.refreshToken ?? refresh);
  return result.data;
};

export const api = new ApiClient({
  baseUrl: apiBaseUrl,
  clientType: 'mobile',
  refresh: doRefresh,
  onRefreshed: (response) => {
    tokenStore.setAccessToken(response.accessToken);
  },
  /**
   * Вызывается ApiClient'ом, когда 401 И первый silent refresh
   * (через `doRefresh`) уже не сработал. Делаем ещё одну попытку —
   * `PLAN_Features_v0.3 §15` — на случай транзиентной сетевой ошибки.
   * Возвращаем `true`, если восстановились (ApiClient повторит исходный
   * запрос), `false` если пришлось чистить токены и логаутить стор.
   */
  onSessionExpired: async () => {
    const recovered = await doRefresh();
    if (recovered) {
      tokenStore.setAccessToken(recovered.accessToken);
      return true;
    }
    tokenStore.setAccessToken(null);
    tokenStore.setRefreshToken(null);
    useAuthStore.getState().logout();
    return false;
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
