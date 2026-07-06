import type { PendingChange } from '@hanzi/shared';

/**
 * Persistent queue of offline changes waiting to be flushed to the
 * server. Implementations:
 *
 * - Web:  `apps/web/src/db/sync/RxDbQueueStorage.ts` (RxDB collection).
 * - RN:   `apps/mobile/src/db/sync/WatermelonQueueStorage.ts`
 *         (WatermelonDB).
 * - Test: in-memory stub (see `createMemoryQueueStorage`).
 */
export interface QueueStorage {
  /** Insert a new pending change. */
  insert(change: PendingChange): Promise<void>;
  /** Return every change that has not yet been acknowledged by the server. */
  listPending(): Promise<PendingChange[]>;
  /** Mark a change as acknowledged. */
  markSynced(id: string): Promise<void>;
  /** Remove a change (e.g. when the server rejects it permanently). */
  remove(id: string): Promise<void>;
  /** Total number of pending changes (used in tests / dev tools). */
  count(): Promise<number>;
}

export function createMemoryQueueStorage(): QueueStorage & { _peek(): PendingChange[] } {
  const items = new Map<string, PendingChange>();
  return {
    async insert(change) {
      items.set(change.id, change);
    },
    async listPending() {
      return [...items.values()].filter((c) => !c.isSynced);
    },
    async markSynced(id) {
      const existing = items.get(id);
      if (existing) items.set(id, { ...existing, isSynced: true });
    },
    async remove(id) {
      items.delete(id);
    },
    async count() {
      return [...items.values()].filter((c) => !c.isSynced).length;
    },
    _peek() {
      return [...items.values()];
    },
  };
}
