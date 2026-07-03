import { useAuthStore } from '../stores/authStore';

const BASE_URL = '/api';

interface RequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

/**
 * API-клиент: обёртка над fetch с авто-прикреплением токена
 * и обработкой 401 (refresh → retry).
 */
export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, setAccessToken, logout } = useAuthStore.getState();

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

  let res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // 401 → пробуем refresh
  if (res.status === 401 && accessToken) {
    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const newToken = data.data?.accessToken;
      if (newToken) {
        setAccessToken(newToken);
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(`${BASE_URL}${path}`, { ...options, headers, credentials: 'include' });
      }
    } else {
      logout();
      throw new Error('Session expired');
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
 */
export async function apiGetBlob(path: string): Promise<Blob> {
  const { accessToken, setAccessToken, logout } = useAuthStore.getState();

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const doFetch = () =>
    fetch(`${BASE_URL}${path}`, { method: 'GET', headers, credentials: 'include' });

  let res = await doFetch();

  if (res.status === 401 && accessToken) {
    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const newToken = data.data?.accessToken;
      if (newToken) {
        setAccessToken(newToken);
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await doFetch();
      }
    } else {
      logout();
      throw new Error('Session expired');
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
