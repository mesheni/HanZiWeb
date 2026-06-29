import { apiPost } from '../api/client';
import { getDb } from './database';
import type { SyncResponse } from '@hanzi/shared';

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
      payload: { ...payload, timestamp: new Date().toISOString() },
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
      const changes = await db.pending_changes.find({
        selector: { isSynced: false },
      }).exec();

      if (changes.length === 0) {
        this.isSyncing = false;
        return;
      }

      const payload = changes.map((c) => ({
        id: c.id,
        type: c.type as 'study_answer',
        payload: c.payload as Record<string, unknown>,
      }));

      const response = await apiPost<SyncResponse>('/sync', { changes: payload });

      for (const result of response.results) {
        const change = changes.find((c) => c.id === result.changeId);
        if (change) {
          await change.patch({ isSynced: true });
        }
      }

      for (const serverChange of response.serverChanges) {
        const existing = await db.progress.findOne({
          selector: { wordId: (serverChange as any).wordId },
        }).exec();

        if (existing) {
          const serverTime = new Date((serverChange as any).timestamp).getTime();
          const localTime = new Date((existing as any).lastReviewDate || 0).getTime();
          if (serverTime > localTime) {
            await existing.patch(serverChange);
          }
        }
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
