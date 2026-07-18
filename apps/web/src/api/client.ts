import { useAuthStore } from '../stores/authStore';

const BASE_URL = '/api';

interface RequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

// Сериализует вызовы /api/auth/refresh при N конкурентных 401
// (PLAN_Features_v0.4 #9). Без этого каждый запрос независимо шлёт
// refresh, сервер ротирует refresh-куку, успевает только первый —
// остальные падают в onSessionExpired → каскадный logout.
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    const doRefresh = async (): Promise<string | null> => {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!refreshRes.ok) return null;
      const data = await refreshRes.json();
      const newToken: string | undefined = data.data?.accessToken;
      if (newToken) {
        useAuthStore.getState().setAccessToken(newToken);
      }
      return newToken ?? null;
    };
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * API-клиент: обёртка над fetch с авто-прикреплением токена
 * и обработкой 401 (refresh → retry). Если refresh не помог —
 * вызывает `authStore.onSessionExpired()`, который делает ещё одну
 * попытку silent refresh перед logout (PLAN_Features_v0.3 §15).
 */
export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, onSessionExpired } = useAuthStore.getState();

  const headers: Record<string, string> = {
    ...options.headers,
  };

  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const doFetch = () =>
    fetch(`${BASE_URL}${path}`, { ...options, headers, credentials: 'include' });

  let res = await doFetch();

  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await doFetch();
    } else {
      const recovered = await onSessionExpired();
      if (recovered) {
        const recoveredToken = useAuthStore.getState().accessToken;
        if (recoveredToken) {
          headers['Authorization'] = `Bearer ${recoveredToken}`;
          res = await doFetch();
        }
      }
      if (res.status === 401) {
        throw new Error('Session expired');
      }
    }
  }

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Request failed: ${res.status}`);
  }

  if (!res.ok || !json.success) {
    throw new Error((json.error as Record<string, string>)?.message ?? `Request failed: ${res.status}`);
  }

  if ('pagination' in json) {
    return { data: json.data, pagination: json.pagination } as T;
  }

  return json.data as T;
}

/**
 * GET-запрос.
 */
export function apiGet<T>(path: string): Promise<T> {
  return apiClient<T>(path, { method: 'GET' });
}

/**
 * POST-запрос.
 */
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiClient<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT-запрос.
 */
export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiClient<T>(path, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE-запрос.
 */
export function apiDelete<T>(path: string): Promise<T> {
  return apiClient<T>(path, { method: 'DELETE' });
}

/**
 * GET-запрос, который возвращает «сырое» тело ответа как Blob
 * (а не JSON). Используется для скачивания файлов экспорта.
 * Прикрепляет access token, при 401 пытается refresh и повторяет.
 * Если refresh не помог — вызывает `onSessionExpired` (silent refresh
 * → fallback на logout) перед тем, как бросить ошибку
 * (PLAN_Features_v0.3 §15).
 */
export async function apiGetBlob(path: string): Promise<Blob> {
  const { accessToken, onSessionExpired } = useAuthStore.getState();

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const doFetch = () =>
    fetch(`${BASE_URL}${path}`, { method: 'GET', headers, credentials: 'include' });

  let res = await doFetch();

  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await doFetch();
    } else {
      const recovered = await onSessionExpired();
      if (recovered) {
        const recoveredToken = useAuthStore.getState().accessToken;
        if (recoveredToken) {
          headers['Authorization'] = `Bearer ${recoveredToken}`;
          res = await doFetch();
        }
      }
      if (res.status === 401) {
        throw new Error('Session expired');
      }
    }
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const json = await res.json();
      const errMsg = (json.error as Record<string, string> | undefined)?.message;
      if (errMsg) message = errMsg;
    } catch {
      // ignore — отдаём дефолтное сообщение
    }
    throw new Error(message);
  }

  return res.blob();
}

/**
 * Скачивает Blob как файл с указанным именем.
 * Использует `URL.createObjectURL` и временный `<a download>`.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
