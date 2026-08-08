/**
 * F07: курсор инкрементального sync изолирован по аккаунту —
 * ключ `hanzi:sync:last-sync-at:<userId>` в localStorage. Без userId
 * курсор не читается и не пишется (первый sync = полный снапшот),
 * иначе чужой курсор пережил бы logout и следующий аккаунт получил бы
 * неполный снапшот прогресса.
 */

export const SYNC_CURSOR_PREFIX = 'hanzi:sync:last-sync-at';

export function syncCursorKey(userId: string): string {
  return `${SYNC_CURSOR_PREFIX}:${userId}`;
}

export function readSyncCursor(userId: string | null): string | null {
  if (!userId || typeof localStorage === 'undefined') return null;
  return localStorage.getItem(syncCursorKey(userId));
}

export function writeSyncCursor(userId: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(syncCursorKey(userId), value);
}

export function removeSyncCursor(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(syncCursorKey(userId));
}
