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
