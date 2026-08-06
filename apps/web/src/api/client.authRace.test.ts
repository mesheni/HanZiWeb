import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore } from '../stores/authStore';
import { apiClient } from './client';

// Гонки авторизации (fix v0.4 §5/§9 follow-up):
//  1) logout() должен быть терминальным — in-flight refresh, стартовавший
//     до logout, не восстанавливает сессию (authGeneration);
//  2) пачка конкурентных 401 после проваленного refresh даёт ровно один
//     logout-флоу (sessionExpiredHandled).

const USER = { id: 'u1', email: 'race@hanzi.local', xp: 0, currentStreak: 0 };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ success: true }, 200)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('logout vs in-flight refresh (fix v0.4 §5 follow-up)', () => {
  it('refresh, резолвнувшийся после logout, не восстанавливает сессию', async () => {
    const fetchMock = vi.mocked(fetch);
    useAuthStore.getState().login(USER, 'old-token');

    // 1-й fetch — исходный запрос → 401; 2-й — refresh (deferred).
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse({ success: false }, 401)),
    );
    let resolveRefresh!: (r: Response) => void;
    const refreshDeferred = new Promise<Response>((res) => {
      resolveRefresh = res;
    });
    fetchMock.mockImplementationOnce(() => refreshDeferred);

    const pending = apiClient('/protected');

    // Дожидаемся, пока refresh реально стартовал (fetch #2 вызван).
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/refresh')),
      ).toHaveLength(1);
    });

    // «Выйти» пока refresh летит.
    useAuthStore.getState().logout();

    // Refresh пришёл УСПЕШНЫМ, но поколение уже сменилось → токен
    // должен быть отброшен, стор не тронут.
    resolveRefresh(
      jsonResponse({ success: true, data: { accessToken: 'new-token' } }, 200),
    );

    await expect(pending).rejects.toThrow('Session expired');

    const store = useAuthStore.getState();
    expect(store.accessToken).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    // Никакого повторного logout-флоу: ровно один POST /auth/logout
    // (от явного logout; onSessionExpired увидел isAuthenticated=false).
    const logoutCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/auth/logout'),
    );
    expect(logoutCalls).toHaveLength(1);
  });
});

describe('onSessionExpired idempotency (fix v0.4 §9 follow-up)', () => {
  it('N конкурентных вызовов → один silent-refresh и один logout', async () => {
    const fetchMock = vi.mocked(fetch);
    useAuthStore.getState().login(USER, 'token');

    // Первый fetch (silent-refresh) проваливается; logout-уведомление — ok.
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse({ success: false }, 401)),
    );

    const [r1, r2, r3] = await Promise.all([
      useAuthStore.getState().onSessionExpired(),
      useAuthStore.getState().onSessionExpired(),
      useAuthStore.getState().onSessionExpired(),
    ]);

    expect(r1).toBe(false);
    expect(r2).toBe(false);
    expect(r3).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/auth/refresh'),
    );
    const logoutCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/auth/logout'),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(logoutCalls).toHaveLength(1);
  });

  it('успешный login сбрасывает флаг — следующий expire снова делает logout', async () => {
    const fetchMock = vi.mocked(fetch);

    // Первая «сессия» истекает → logout.
    useAuthStore.getState().login(USER, 'token');
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse({ success: false }, 401)),
    );
    await useAuthStore.getState().onSessionExpired();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    // Пользователь залогинился заново.
    useAuthStore.getState().login(USER, 'token-2');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    // Новый expire обязан снова привести к logout (флаг сброшен).
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse({ success: false }, 401)),
    );
    await useAuthStore.getState().onSessionExpired();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/logout')),
    ).toHaveLength(2);
  });
});
