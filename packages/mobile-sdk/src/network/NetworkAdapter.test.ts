import { describe, it, expect, beforeEach } from 'vitest';
import { setNetworkAdapter, isOnline, subscribeNetwork } from './NetworkAdapter';

class FakeNetworkAdapter {
  private listeners = new Set<(online: boolean) => void>();
  constructor(private state: boolean) {}
  isOnline() {
    return this.state;
  }
  subscribe(listener: (online: boolean) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  go(online: boolean) {
    this.state = online;
    for (const l of this.listeners) l(online);
  }
}

describe('NetworkAdapter', () => {
  let net: FakeNetworkAdapter;
  beforeEach(() => {
    net = new FakeNetworkAdapter(true);
    setNetworkAdapter(net as never);
  });

  it('isOnline() returns the adapter snapshot', () => {
    expect(isOnline()).toBe(true);
    net.go(false);
    expect(isOnline()).toBe(false);
  });

  it('subscribe() delivers transitions and returns an unsubscribe function', () => {
    const seen: boolean[] = [];
    const unsub = subscribeNetwork((online) => seen.push(online));
    net.go(false);
    net.go(true);
    unsub();
    net.go(false);
    expect(seen).toEqual([false, true]);
  });
});
