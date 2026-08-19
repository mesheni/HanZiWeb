import { isOnline, subscribeNetwork } from '../network/NetworkAdapter';
import type { ApiClient } from '../api/ApiClient';
import type { PendingChange, PendingChangeType, ServerChange, SyncResponse } from '@hanzi/shared';
import { SyncResponseSchema } from '@hanzi/shared';
import type { QueueStorage } from './QueueStorage';
import { getSecureStorage } from '../storage/SecureStorage';

/** Префикс ключа курсора инкрементального sync (F32 — журнал). */
const SYNC_CURSOR_PREFIX = 'hanzi:sync:last-cursor';

/**
 * F07: ключ курсора в SecureStorage изолирован по аккаунту —
 * `hanzi:sync:last-sync-at:<userId>`. Без userId (до логина) — null,
 * курсор не читается и не пишется.
 */
function syncCursorKey(userId: string | null): string | null {
  return userId ? `${SYNC_CURSOR_PREFIX}:${userId}` : null;
}

export interface SyncEngineOptions {
  api: ApiClient;
  storage: QueueStorage;
  /** Generate a UUID for new pending changes. Override for deterministic tests. */
  idFactory?: () => string;
  /** Initial retry delay (ms) — doubles on each failure, capped at max. */
  initialRetryDelay?: number;
  maxRetryDelay?: number;
}

interface PendingChangePayloadBase {
  wordId: string;
  rating: 1 | 2 | 3 | 4;
  timestamp?: string;
  sessionId?: string;
}

/**
 * Cross-platform offline-first sync engine.
 *
 * Behaviour (mirrors `apps/web/src/db/sync.ts`):
 *
 * 1. `enqueueChange()` writes the change to {@link QueueStorage} and
 *    immediately tries to flush if we are online.
 * 2. `flush()` collects every `isSynced: false` change, sends them to
 *    `POST /sync` and marks each one as synced on success. The server's
 *    `serverChanges` payload is forwarded to {@link onServerChange} for
 *    the host to apply (e.g. upsert local progress rows).
 * 3. Subscribes to {@link NetworkAdapter} so we re-flush as soon as
 *    connectivity is restored.
 * 4. Retries with exponential backoff on transient errors (capped).
 */
export class SyncEngine {
  private api: ApiClient;
  private storage: QueueStorage;
  private idFactory: () => string;
  private initialRetryDelay: number;
  private maxRetryDelay: number;
  private isFlushing = false;
  private flushPromise: Promise<void> | null = null;
  private retryDelay: number;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeNetwork: (() => void) | null = null;
  private isStarted = false;
  private isDestroyed = false;
  private onServerChange?: (change: ServerChange) => void | Promise<void>;
  /**
   * F32: курсор инкрементального sync — монотонный id последней
   * полученной записи серверного журнала. Слается как `sinceCursor`;
   * сервер отдаёт записи журнала с id > курсора + `nextCursor`.
   */
  private lastSyncAt: number | null;
  /** F07: текущий аккаунт — курсор хранится per-user. */
  private currentUserId: string | null = null;

  constructor(options: SyncEngineOptions) {
    this.api = options.api;
    this.storage = options.storage;
    this.idFactory = options.idFactory ?? (() => generateId());
    this.initialRetryDelay = options.initialRetryDelay ?? 1000;
    this.maxRetryDelay = options.maxRetryDelay ?? 30_000;
    this.retryDelay = this.initialRetryDelay;
    this.lastSyncAt = null;
  }

  /**
   * F07: привязывает движок к аккаунту — курсор читается из
   * per-user ключа (изоляция: чужой курсор не переживает смену
   * аккаунта). Вызывается после login/hydrate; `null` — выйти.
   */
  setCurrentUserId(userId: string | null): void {
    if (userId === this.currentUserId) return;
    this.currentUserId = userId ?? null;
    this.lastSyncAt = this.currentUserId ? readSyncCursor(this.currentUserId) : null;
  }

  /**
   * F07: стирает локальное состояние аккаунта — очередь pending-изменений
   * и курсор. Вызывается при logout: чужие ответы и курсор не должны
   * пережить смену аккаунта (иначе ответы аккаунта A улетели бы на
   * сервер под токеном аккаунта B).
   */
  async clearLocalState(): Promise<void> {
    await this.storage.clearAll();
    if (this.currentUserId) {
      removeSyncCursor(this.currentUserId);
    }
    this.lastSyncAt = null;
    this.retryDelay = this.initialRetryDelay;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /** Subscribe to server-pushed changes (used to update local progress). */
  setOnServerChange(handler: (change: ServerChange) => void | Promise<void>): void {
    this.onServerChange = handler;
  }

  start(): void {
    if (this.isStarted || this.isDestroyed) return;
    this.isStarted = true;
    this.unsubscribeNetwork = subscribeNetwork((online) => {
      if (online) this.flush();
    });
    if (isOnline()) {
      void this.flush();
    }
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.isStarted = false;
    if (this.unsubscribeNetwork) {
      this.unsubscribeNetwork();
      this.unsubscribeNetwork = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async enqueueChange(type: PendingChangeType, payload: PendingChangePayloadBase): Promise<void> {
    if (this.isDestroyed) throw new Error('SyncEngine has been destroyed');

    const change: PendingChange = {
      id: this.idFactory(),
      type,
      payload: {
        wordId: payload.wordId,
        rating: payload.rating,
        timestamp: payload.timestamp ?? new Date().toISOString(),
        ...(payload.sessionId !== undefined ? { sessionId: payload.sessionId } : {}),
      },
      isSynced: false,
      createdAt: new Date().toISOString(),
    };

    await this.storage.insert(change);
    if (isOnline()) {
      // Fire-and-forget. Callers that need to wait for the round-trip
      // can `await engine.flush()` explicitly — which will join the
      // already-running flush instead of starting a new one.
      void this.flush();
    }
  }

  /**
   * Send every pending change to the server.
   *
   * - If no flush is in flight, starts a new one and waits for it to
   *   finish.
   * - If a flush is already running, joins the in-flight promise so
   *   concurrent callers don't race against `markSynced` / the storage
   *   backend. The in-flight loop re-checks `pending` on every
   *   iteration, so changes enqueued mid-flight get picked up too.
   * - The returned promise resolves after the in-flight flush exits
   *   (either because there are no more pending changes, the server
   *   errored, or the iteration cap was hit).
   */
  async flush(): Promise<void> {
    if (this.isDestroyed) return;
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.runFlushLoop();
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
      this.isFlushing = false;
    }
  }

  private async runFlushLoop(): Promise<void> {
    this.isFlushing = true;
    try {
      let iterations = 0;
      const MAX_ITERATIONS = 10;
      while (iterations < MAX_ITERATIONS) {
        iterations += 1;
        const pending = await this.storage.listPending();
        if (pending.length === 0) {
          this.retryDelay = this.initialRetryDelay;
          return;
        }

        const response = await this.api.post<SyncResponse>('/sync', {
          changes: pending.map((c) => ({ id: c.id, type: c.type, payload: c.payload })),
          // F32: инкрементальный sync из серверного журнала. Без курсора
          // (первый sync) сервер отдаёт полный снапшот + nextCursor.
          sinceCursor: this.lastSyncAt ?? undefined,
        });

        if (!response.ok) {
          this.scheduleRetry();
          return;
        }

        // Контракт sync-ответа фиксируется в shared-схеме: дрифт
        // сервера (неизвестные поля serverChanges, difficulty вне
        // [0, 1], …) падает здесь с ZodError → catch → retry, а не
        // проваливается тихо в локальное хранилище
        // (PLAN_Features_v0.4 §40, §41).
        const data = SyncResponseSchema.parse(response.data);

        const ackedIds = new Set(data.results.map((r) => r.changeId));
        for (const change of pending) {
          if (ackedIds.has(change.id)) {
            await this.storage.markSynced(change.id);
          }
        }

        // Ошибка применения serverChange не должна продвигать курсор:
        // иначе изменения с других устройств терялись на этом устройстве
        // навсегда (курсор уже ушёл вперёд, ретрая не будет).
        let appliedAll = true;
        for (const serverChange of data.serverChanges) {
          try {
            await this.onServerChange?.(serverChange);
          } catch (err) {
            appliedAll = false;
            console.error('[SyncEngine] failed to apply server change', err);
            break;
          }
        }

        // F32: продвигаем курсор до nextCursor сервера (монотонный id
        // журнала) — журнал, а не timestamp, теперь источник правды.
        if (appliedAll) {
          this.lastSyncAt = data.nextCursor;
          if (this.currentUserId) {
            writeSyncCursor(this.currentUserId, this.lastSyncAt);
          }
        }

        this.retryDelay = this.initialRetryDelay;
        // Loop re-checks `pending` at the top, so new changes
        // enqueued during the iteration get picked up automatically.
      }
    } catch {
      this.scheduleRetry();
      return;
    }

    // Iteration-cap достигнут (PLAN_Features_v0.4 §49): раньше здесь был
    // тихий return — оставшиеся pending-элементы ждали внешнего
    // триггера (следующий enqueueChange или reconnect), и после
    // офлайн-сессии часть прогресса «застревала» до следующего ответа.
    // Теперь планируем отложенный re-flush — очередь дочищается сама.
    if ((await this.storage.listPending()).length > 0) {
      this.scheduleRetry();
    }
  }

  /** Number of pending changes (test helper). */
  async pendingCount(): Promise<number> {
    return this.storage.count();
  }

  /** Diagnostic snapshot for debug UIs. */
  getStatus() {
    return { isFlushing: this.isFlushing, retryDelay: this.retryDelay };
  }

  private scheduleRetry(): void {
    if (this.isDestroyed) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }
}

function generateId(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Читает курсор инкрементального sync из SecureStorage по per-user ключу
 * (F07). Хранится числом (JSON) — монотонный id журнала (F32).
 * Если хранилище не зарегистрировано (юнит-тесты) — null.
 */
function readSyncCursor(userId: string): number | null {
  const key = syncCursorKey(userId);
  if (!key) return null;
  try {
    const raw = getSecureStorage().getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Персистит курсор; при недоступном хранилище — молча пропускает. */
function writeSyncCursor(userId: string, value: number): void {
  const key = syncCursorKey(userId);
  if (!key) return;
  try {
    getSecureStorage().setItem(key, JSON.stringify(value));
  } catch {
    // SecureStorage не зарегистрирован — курсор живёт в памяти.
  }
}

/** Удаляет курсор аккаунта (logout, F07). */
function removeSyncCursor(userId: string): void {
  const key = syncCursorKey(userId);
  if (!key) return;
  try {
    getSecureStorage().removeItem(key);
  } catch {
    // Хранилище не зарегистрировано — удалять нечего.
  }
}
