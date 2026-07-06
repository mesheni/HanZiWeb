/**
 * Platform-agnostic abstraction over the online/offline indicator.
 *
 * Web uses `navigator.onLine` + the `online`/`offline` window events.
 * React Native uses `@react-native-community/netinfo` (provided by the
 * consumer via {@link setNetworkAdapter}).
 *
 * The SDK never reaches for `navigator` or `window` directly — all access
 * goes through this interface, which keeps the SDK bundle truly
 * cross-platform.
 */
export interface NetworkAdapter {
  /** Synchronous snapshot of the current connectivity state. */
  isOnline(): boolean;
  /**
   * Subscribe to connectivity changes. The listener is invoked with the
   * new value whenever the underlying source emits. Returns an
   * `unsubscribe` function.
   */
  subscribe(listener: (online: boolean) => void): () => void;
}

let activeAdapter: NetworkAdapter | null = null;

/**
 * Inject the platform-specific adapter exactly once (e.g. from
 * `apps/web/src/lib/networkAdapter.ts` or
 * `apps/mobile/src/lib/networkAdapter.ts`).
 */
export function setNetworkAdapter(adapter: NetworkAdapter): void {
  activeAdapter = adapter;
}

export function getNetworkAdapter(): NetworkAdapter {
  if (!activeAdapter) {
    throw new Error(
      'No NetworkAdapter registered. Call setNetworkAdapter() at app startup.',
    );
  }
  return activeAdapter;
}

/** `true` when the device currently has network access. */
export function isOnline(): boolean {
  return getNetworkAdapter().isOnline();
}

/**
 * Subscribe to connectivity changes. Listener fires immediately with the
 * current state, then again on every transition. Returns an unsubscribe
 * function.
 */
export function subscribeNetwork(listener: (online: boolean) => void): () => void {
  return getNetworkAdapter().subscribe(listener);
}
