/**
 * Platform-agnostic key-value store for small values (tokens, prefs).
 *
 * Web implementation: `localStorage` (tokens) + `sessionStorage` (where
 * appropriate). Provided in `apps/web/src/lib/secureStorage.ts`.
 *
 * React Native implementation: `react-native-mmkv` (synchronous) or
 * `expo-secure-store` (encrypted). Provided in
 * `apps/mobile/src/lib/secureStorage.ts`.
 *
 * The contract is intentionally minimal: sync get/set/remove. The SDK
 * never calls `localStorage`, `window`, or any RN-specific module
 * directly.
 */
export interface SecureStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let activeStorage: SecureStorage | null = null;

export function setSecureStorage(storage: SecureStorage): void {
  activeStorage = storage;
}

export function getSecureStorage(): SecureStorage {
  if (!activeStorage) {
    throw new Error(
      'No SecureStorage registered. Call setSecureStorage() at app startup.',
    );
  }
  return activeStorage;
}

/** Convenience helper that JSON-parses the value, or returns `null`. */
export function readJson<T>(key: string): T | null {
  const raw = getSecureStorage().getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  getSecureStorage().setItem(key, JSON.stringify(value));
}
