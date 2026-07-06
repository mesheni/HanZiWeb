import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiClient } from './ApiClient';
import type { AuthResponse } from '@hanzi/shared';
import { getTokenStore, setTokenStore, createDefaultTokenStore, applyAuthResponse } from '../auth/TokenStore';
import { setSecureStorage } from '../storage/SecureStorage';

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

function okJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errJson(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient', () => {
  beforeEach(() => {
    setSecureStorage(new MemoryStorage() as never);
    setTokenStore(createDefaultTokenStore());
  });

  it('attaches Authorization header when access token is set', async () => {
    getTokenStore().setAccessToken('access-123');
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const client = new ApiClient({
      baseUrl: 'https://api.example.com',
      refresh: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.get('/me');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-123');
  });

  it('sends refresh token as Bearer when withRefreshToken=true and no access', async () => {
    getTokenStore().setRefreshToken('refresh-xyz');
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const client = new ApiClient({
      baseUrl: 'https://api.example.com',
      refresh: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.post('/auth/refresh', { refreshToken: 'foo' }, { withRefreshToken: true });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer refresh-xyz');
  });

  it('serialises JSON bodies and sets Content-Type automatically', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ id: 1 }));
    const client = new ApiClient({
      baseUrl: 'https://api.example.com',
      refresh: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.post('/users', { name: 'alice' });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"name":"alice"}');
  });

  it('returns a tagged-union success result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ value: 42 }));
    const client = new ApiClient({
      baseUrl: 'https://api.example.com',
      refresh: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await client.get<{ value: number }>('/count');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.data.value).toBe(42);
    }
  });

  it('returns a tagged-union error result for non-2xx responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errJson('NOT_FOUND', 'Nope', 404));
    const client = new ApiClient({
      baseUrl: 'https://api.example.com',
      refresh: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await client.get('/missing');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe('NOT_FOUND');
      expect(result.message).toBe('Nope');
    }
  });

  it('attempts a refresh + retry on 401, then succeeds', async () => {
    getTokenStore().setAccessToken('expired');
    const refreshed: AuthResponse = {
      user: { id: 'u1', email: 'u@x.com', xp: 0, currentStreak: 0 },
      accessToken: 'fresh',
      expiresIn: 900,
    };
    // The host's refresh function is responsible for persisting the new
    // tokens — typically by calling `applyAuthResponse(response)`.
    const refreshFn = vi.fn().mockImplementation(async () => {
      applyAuthResponse(refreshed);
      return refreshed;
    });
    const onRefreshed = vi.fn();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errJson('NO_TOKEN', 'expired', 401))
      .mockResolvedValueOnce(okJson({ ok: true }));

    const client = new ApiClient({
      baseUrl: 'https://api.example.com',
      refresh: refreshFn,
      onRefreshed,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await client.get('/me');
    expect(result.ok).toBe(true);
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(onRefreshed).toHaveBeenCalledWith(refreshed);
    expect(getTokenStore().getAccessToken()).toBe('fresh');
    // Two requests total: initial 401, then retry with the new token.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((retryInit.headers as Record<string, string>)['Authorization']).toBe('Bearer fresh');
  });

  it('fires onSessionExpired when refresh fails', async () => {
    getTokenStore().setAccessToken('expired');
    const refreshFn = vi.fn().mockResolvedValue(null);
    const onSessionExpired = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(errJson('NO_TOKEN', 'expired', 401));

    const client = new ApiClient({
      baseUrl: 'https://api.example.com',
      refresh: refreshFn,
      onSessionExpired,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await client.get('/me');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNAUTHENTICATED');
    }
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('falls back to PARSE_ERROR when response is not JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('<html>500</html>', { status: 500, headers: { 'Content-Type': 'text/html' } }));
    const client = new ApiClient({
      baseUrl: 'https://api.example.com',
      refresh: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await client.get('/oops');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PARSE_ERROR');
      expect(result.status).toBe(500);
    }
  });

  it('getBlob returns null on HTTP error and Blob on success', async () => {
    const okBlob = new Response(new Blob(['hello']), { status: 200 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(okBlob);
    const client = new ApiClient({
      baseUrl: 'https://api.example.com',
      refresh: async () => null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(await client.getBlob('/export')).toBeNull();
    const blob = await client.getBlob('/export');
    expect(blob).toBeInstanceOf(Blob);
  });
});
