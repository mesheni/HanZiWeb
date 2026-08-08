import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type { ApiClient } from '@hanzi/mobile-sdk';
import type { SyncResponse } from '@hanzi/shared';
import { ProgressModel } from './models';
import { applyServerChange } from './progressSync';

/**
 * F21: наполняет таблицу `progress` снапшотом серверного прогресса.
 *
 * Обычно зеркало наполняется pull-merge (F08) из serverChanges при
 * flush'ах SyncEngine — но flush происходит только когда есть
 * pending-изменения. На свежем устройстве таблица пуста, и офлайн-
 * сессия не видела бы due-слова. Поэтому при старте (один раз, пока
 * таблица пуста) вытягиваем полный снапшот через `/sync` с пустым
 * changes-массивом и применяем его к локальной таблице.
 */
export async function pullProgressSnapshot(
  db: Database,
  api: ApiClient,
  userId: string,
): Promise<void> {
  const hasLocalProgress =
    (await db.get<ProgressModel>('progress').query(Q.where('user_id', userId)).fetchCount()) > 0;
  if (hasLocalProgress) return;

  const result = await api.post<SyncResponse>('/sync', { changes: [] });
  if (!result.ok) return;

  for (const change of result.data.serverChanges) {
    await applyServerChange(db, change, userId);
  }
}
