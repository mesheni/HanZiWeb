import { describe, it, expect, beforeEach } from 'vitest';
import { setSecureStorage, getSecureStorage, readJson, writeJson } from './SecureStorage';

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

describe('SecureStorage helpers', () => {
  beforeEach(() => {
    setSecureStorage(new MemoryStorage() as never);
  });

  it('round-trips JSON via readJson/writeJson', () => {
    writeJson('user', { id: 1, name: 'alice' });
    expect(readJson<{ id: number; name: string }>('user')).toEqual({ id: 1, name: 'alice' });
  });

  it('readJson returns null for missing keys', () => {
    expect(readJson('missing')).toBeNull();
  });

  it('readJson swallows invalid JSON and returns null', () => {
    getSecureStorage().setItem('bad', '{not valid');
    expect(readJson('bad')).toBeNull();
  });
});
