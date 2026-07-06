/**
 * @hanzi/mobile-sdk
 *
 * Cross-platform runtime for HanZiWeb clients. Shared by `apps/web`
 * (Vite + React 18) and `apps/mobile` (Expo / React Native). Anything
 * that should work the same on both platforms — fetch wrapper, sync
 * engine, FSRS calculation, token storage — lives here.
 *
 * Anything platform-specific (which event source to use, which
 * storage backend, which navigator) is provided by the host through
 * a small set of "adapter" functions:
 *
 *   - `setNetworkAdapter()`     — `navigator.onLine` (web) or NetInfo (RN)
 *   - `setSecureStorage()`      — `localStorage` (web) or MMKV (RN)
 *   - `setTokenStore()`         — `{ get/set AccessToken, get/set RefreshToken }`
 *
 * Call those once at app startup, then use the rest of the SDK.
 */
export * from './api';
export * from './auth';
export * from './fsrs';
export * from './network';
export * from './storage';
export * from './sync';
