import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type { QueueStorage } from '@hanzi/mobile-sdk';
import type { PendingChange } from '@hanzi/shared';
import { WordModel, ProgressModel, PendingChangeModel } from './models';

/**
 * WatermelonDB-backed {@link QueueStorage}. Each pending change lives
 * in a row of the `pending_changes` table; `listPending()` is a
 * `SELECT WHERE is_synced = 0 ORDER BY created_at ASC`.
 */
export function createWatermelonQueueStorage(db: Database): QueueStorage {
  const collection = db.get<PendingChangeModel>('pending_changes');

  return {
    async insert(change: PendingChange): Promise<void> {
      await db.write(async () => {
        await collection.create((row) => {
          row.changeId = change.id;
          row.type = change.type;
          row.payload = change.payload as Record<string, unknown>;
          row.isSynced = change.isSynced;
          row.createdAt = new Date(change.createdAt);
        });
      });
    },

    async listPending(): Promise<PendingChange[]> {
      const rows = await collection
        .query(Q.where('is_synced', false), Q.sortBy('created_at', Q.asc))
        .fetch();
      return rows.map(toPendingChange);
    },

    async markSynced(id: string): Promise<void> {
      const rows = await collection.query(Q.where('change_id', id)).fetch();
      if (rows.length === 0) return;
      await db.write(async () => {
        for (const row of rows) {
          // Реальное удаление вместо пометки is_synced: иначе таблица
          // росла по строке на каждый ответ, и listPending/clearAll
          // деградировали вместе с ней.
          await row.destroyPermanently();
        }
      });
    },

    async remove(id: string): Promise<void> {
      const rows = await collection.query(Q.where('change_id', id)).fetch();
      if (rows.length === 0) return;
      await db.write(async () => {
        for (const row of rows) {
          // destroyPermanently() — реальное удаление строки. markAsDeleted
          // (мягкое удаление) оставлял запись в таблице навсегда —
          // pending_changes росла безгранично при перманентном отказе
          // сервера (PLAN_Features_v0.4 §51).
          await row.destroyPermanently();
        }
      });
    },

    async count(): Promise<number> {
      return collection.query(Q.where('is_synced', false)).fetchCount();
    },

    async clearAll(): Promise<void> {
      const rows = await collection.query().fetch();
      if (rows.length === 0) return;
      await db.write(async () => {
        for (const row of rows) {
          await row.destroyPermanently();
        }
      });
    },
  };
}

function toPendingChange(row: PendingChangeModel): PendingChange {
  return {
    id: row.changeId,
    type: row.type as PendingChange['type'],
    payload: row.payload as PendingChange['payload'],
    isSynced: row.isSynced,
    createdAt: row.createdAt.toISOString(),
  };
}

export { WordModel, ProgressModel };
