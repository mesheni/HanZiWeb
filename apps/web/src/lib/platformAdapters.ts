/**
 * Web-side adapters for `@hanzi/mobile-sdk`. Wires the SDK to the
 * browser's `navigator.onLine` + `localStorage` so the rest of
 * `apps/web` can keep using its existing `useAuthStore` / `apiClient`
 * APIs unchanged. The native equivalents live in
 * `apps/mobile/src/bootstrap.ts`.
 */
import {
  setNetworkAdapter,
  setSecureStorage,
  setTokenStore,
  createDefaultTokenStore,
  type NetworkAdapter,
  type SecureStorage,
} from '@hanzi/mobile-sdk';

let started = false;

export function installWebAdapters(): void {
  if (started) return;
  started = true;

  const webNetwork: NetworkAdapter = {
    isOnline: () => (typeof navigator !== 'undefined' ? navigator.onLine : true),
    subscribe: (listener) => {
      if (typeof window === 'undefined') return () => undefined;
      const onOnline = () => listener(true);
      const onOffline = () => listener(false);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    },
  };

  const webStorage: SecureStorage = {
    getItem: (k) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
  };

  setNetworkAdapter(webNetwork);
  setSecureStorage(webStorage);
  setTokenStore(createDefaultTokenStore());
}
