import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type { ServerChange } from '@hanzi/shared';
import { ProgressModel } from './models';

/**
 * F08: pull-merge — применяет `serverChange` из sync-ответа к локальной
 * таблице `progress` (зеркало серверного прогресса).
 *
 * Строка создаётся, если её нет: первый sync (без курсора) — полный
 * снапшот, а других источников записи у таблицы на мобайле нет.
 * Существующая строка патчится, только если серверный timestamp новее
 * локального lastReviewDate (семантика как в web-версии
 * `apps/web/src/db/sync.ts`).
 */
export async function applyServerChange(
  db: Database,
  change: ServerChange,
  userId: string | null,
): Promise<void> {
  const collection = db.get<ProgressModel>('progress');
  const conditions = userId
    ? [Q.where('user_id', userId), Q.where('word_id', change.wordId)]
    : [Q.where('word_id', change.wordId)];
  const rows = await collection.query(...conditions).fetch();
  const existing = rows[0] ?? null;

  if (!existing) {
    if (!userId) return;
    await db.write(async () => {
      await collection.create((row) => {
        row.userId = userId;
        row.wordId = change.wordId;
        row.state = change.state;
        row.stability = change.stability;
        row.difficulty = change.difficulty;
        row.reps = change.reps;
        row.dueDate = change.dueDate;
        row.lastReviewDate = change.lastReviewDate;
      });
    });
    return;
  }

  const serverTime = Date.parse(change.timestamp);
  const localTime = existing.lastReviewDate ? Date.parse(existing.lastReviewDate) : 0;
  if (serverTime > localTime) {
    await db.write(async () => {
      await existing.update((row) => {
        row.state = change.state;
        row.stability = change.stability;
        row.difficulty = change.difficulty;
        row.reps = change.reps;
        row.dueDate = change.dueDate;
        row.lastReviewDate = change.lastReviewDate;
      });
    });
  }
}
