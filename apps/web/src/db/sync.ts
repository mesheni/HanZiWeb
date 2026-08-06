import { apiPost } from '../api/client';
import { getDb } from './database';
import type { SyncResponse } from '@hanzi/shared';

/** Курсор инкрементального sync (PLAN_Features_v0.4 §48). */
const SYNC_CURSOR_KEY = 'hanzi:sync:last-sync-at';

let engineInstance: SyncEngine | null = null;

export class SyncEngine {
  private isSyncing = false;
  private retryDelay = 1000;
  private maxRetryDelay = 30000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private onlineHandler: (() => void) | null = null;

  start() {
    this.onlineHandler = () => this.flushChanges();
    window.addEventListener('online', this.onlineHandler);

    if (navigator.onLine) {
      this.flushChanges();
    }
  }

  destroy() {
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
  }

  async enqueueChange(type: 'study_answer', payload: Record<string, unknown>) {
    const db = getDb();
    if (!db) throw new Error('Database not initialized');

    await db.pending_changes.insert({
      id: crypto.randomUUID(),
      type,
      payload: {
        ...payload,
        // Клиент может передать timestamp (момент ответа) — используем
        // его, а не перевыпускаем: иначе дедуп в sync.service.ts
        // (`changeTime <= existingTime`) не отловит flush после
        // успешного live-post и ответ применится дважды
        // (fix v0.4 §45 follow-up).
        timestamp: (payload.timestamp as string | undefined) ?? new Date().toISOString(),
      },
      isSynced: false,
      createdAt: new Date().toISOString(),
    });

    if (navigator.onLine) {
      this.flushChanges();
    }
  }

  async flushChanges() {
    if (this.isSyncing) return;
    const db = getDb();
    if (!db) return;

    this.isSyncing = true;

    try {
      const changes = await db.pending_changes
        .find({
          selector: { isSynced: false },
        })
        .exec();

      if (changes.length === 0) {
        this.isSyncing = false;
        return;
      }

      const payload = changes.map((c) => ({
        id: c.id,
        type: c.type as 'study_answer',
        payload: c.payload as Record<string, unknown>,
      }));

      const response = await apiPost<SyncResponse>('/sync', {
        changes: payload,
        // Инкрементальный sync: сервер отдаёт только изменения после
        // курсора; без курсора (первый sync) — полный снапшот.
        sinceTimestamp: localStorage.getItem(SYNC_CURSOR_KEY) ?? undefined,
      });

      for (const result of response.results) {
        const change = changes.find((c) => c.id === result.changeId);
        if (change) {
          await change.patch({ isSynced: true });
        }
      }

      for (const serverChange of response.serverChanges) {
        const existing = await db.progress
          .findOne({
            selector: { wordId: serverChange.wordId },
          })
          .exec();

        if (existing) {
          const serverTime = new Date(serverChange.timestamp).getTime();
          const localTime = new Date(existing.lastReviewDate || 0).getTime();
          if (serverTime > localTime) {
            // `timestamp` — служебное поле курсора sync, в локальный
            // документ прогресса оно не пишется (типизированный patch).
            const { timestamp: _timestamp, ...progressPatch } = serverChange;
            await existing.patch(progressPatch);
          }
        }
      }

      // Продвигаем курсор до максимального timestamp'а serverChanges —
      // следующий sync получит только изменения после него.
      let maxTs = Number(localStorage.getItem(SYNC_CURSOR_KEY) ?? 0);
      for (const serverChange of response.serverChanges) {
        const ts = new Date(serverChange.timestamp).getTime();
        if (ts > maxTs) maxTs = ts;
      }
      if (maxTs > 0) {
        localStorage.setItem(SYNC_CURSOR_KEY, new Date(maxTs).toISOString());
      }

      this.retryDelay = 1000;
    } catch {
      this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.flushChanges(), this.retryDelay);
    } finally {
      this.isSyncing = false;
    }
  }

  getStatus() {
    return { isSyncing: this.isSyncing };
  }
}

export function getSyncEngine(): SyncEngine | null {
  return engineInstance;
}

export function initSyncEngine(): SyncEngine {
  if (!engineInstance) {
    engineInstance = new SyncEngine();
    engineInstance.start();
  }
  return engineInstance;
}
