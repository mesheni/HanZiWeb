import type { AuthResponse } from '@hanzi/shared';
import { getTokenStore } from '../auth/TokenStore';

export interface ApiClientOptions {
  /** Base URL of the server, including the `/api` prefix. */
  baseUrl: string;
  /**
   * Returns the most recent auth response from `/auth/refresh`. Used
   * when a 401 is encountered mid-flight.
   */
  refresh: () => Promise<AuthResponse | null>;
  /**
   * Called after a successful refresh, so the consumer can update any
   * in-memory auth state (e.g. the zustand store).
   */
  onRefreshed?: (response: AuthResponse) => void;
  /**
   * Called when refresh fails. The consumer gets one last chance to
   * recover the session (PLAN_Features_v0.3 §15): it may attempt another
   * silent refresh internally and return `true` if it succeeded — in
   * that case the original request is retried automatically. If the
   * callback returns `false`/`void` (or the returned Promise resolves to
   * `false`/`void`), the consumer has dropped the session and the
   * caller sees a `401 UNAUTHENTICATED` result.
   */
  onSessionExpired?: () => Promise<boolean> | boolean | void;
  /** Default `fetch` to use. Override in tests. */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
  /** If `true`, attach the (refresh) Bearer token to the request. */
  withRefreshToken?: boolean;
  /** When `true`, the response is returned as a `Blob` instead of JSON. */
  raw?: boolean;
}

export interface ApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

export interface ApiError {
  ok: false;
  status: number;
  code: string;
  message: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

/**
 * Cross-platform fetch wrapper used by both `apps/web` and `apps/mobile`.
 *
 * Differences from the web-only version:
 *
 * - Uses a `TokenStore` (injected by the host) instead of reading from
 *   `useAuthStore` directly.
 * - Sends the refresh token as `Authorization: Bearer <refresh>` when
 *   `withRefreshToken: true` is passed (used on mobile, where the
 *   server can't read an HttpOnly cookie).
 * - All output is returned as a tagged union so the caller can decide
 *   whether to surface the error to the user, retry, or fall back to a
 *   queued offline write.
 */
export class ApiClient {
  private baseUrl: string;
  private refresh: () => Promise<AuthResponse | null>;
  private onRefreshed?: (response: AuthResponse) => void;
  private onSessionExpired?: () => Promise<boolean> | boolean | void;
  private fetchImpl: typeof fetch;
  private isRefreshing = false;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.refresh = options.refresh;
    this.onRefreshed = options.onRefreshed;
    this.onSessionExpired = options.onSessionExpired;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const init = this.buildInit(options);
    const res = await this.fetchImpl(url, init);
    return this.handleResponse<T>(res, path, options);
  }

  async get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResult<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResult<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  async put<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResult<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  async delete<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResult<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * Downloads the response as a `Blob` (used for progress export / CSV).
   * Returns `null` on HTTP error so the caller can render a toast.
   * Mirrors the 401 → refresh → `onSessionExpired` flow used by
   * {@link request} (PLAN_Features_v0.3 §15).
   */
  async getBlob(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<Blob | null> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const init = this.buildInit(options);
    let res = await this.fetchImpl(url, init);

    if (res.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.getBlob(path, options);
      }
      const recovered = await this.onSessionExpired?.();
      if (recovered) {
        return this.getBlob(path, options);
      }
      return null;
    }
    if (!res.ok) return null;
    return res.blob();
  }

  private buildInit(options: RequestOptions): RequestInit {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    const hasBody = options.body !== undefined && options.body !== null;
    if (hasBody && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const access = getTokenStore().getAccessToken();
    if (access) {
      headers['Authorization'] = `Bearer ${access}`;
    } else if (options.withRefreshToken) {
      const refresh = getTokenStore().getRefreshToken();
      if (refresh) headers['Authorization'] = `Bearer ${refresh}`;
    }

    const { body: _ignoredBody, withRefreshToken: _a, raw: _b, ...rest } = options;
    void _ignoredBody;
    void _a;
    void _b;
    const init: RequestInit = { ...rest, headers };

    if (hasBody) {
      init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    return init;
  }

  private async handleResponse<T>(
    res: Response,
    path: string,
    options: RequestOptions,
  ): Promise<ApiResult<T>> {
    if (res.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request<T>(path, options);
      }
      const recovered = await this.onSessionExpired?.();
      if (recovered) {
        return this.request<T>(path, options);
      }
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Session expired',
      };
    }

    let json: { success?: boolean; data?: T; error?: { code?: string; message?: string } } | null;
    try {
      json = (await res.json()) as typeof json;
    } catch {
      return {
        ok: false,
        status: res.status,
        code: 'PARSE_ERROR',
        message: `Invalid JSON response (${res.status})`,
      };
    }

    if (!res.ok || !json || !json.success) {
      return {
        ok: false,
        status: res.status,
        code: json?.error?.code ?? 'UNKNOWN',
        message: json?.error?.message ?? `Request failed: ${res.status}`,
      };
    }

    return { ok: true, status: res.status, data: json.data as T };
  }

  private async tryRefresh(): Promise<AuthResponse | null> {
    if (this.isRefreshing) return null;
    this.isRefreshing = true;
    try {
      const result = await this.refresh();
      if (result) this.onRefreshed?.(result);
      return result;
    } finally {
      this.isRefreshing = false;
    }
  }
}
