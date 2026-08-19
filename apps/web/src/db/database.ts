import { createRxDatabase, type RxDatabase, type RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';

const WORDS_SCHEMA = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    character: { type: 'string' },
    pinyin: { type: 'string' },
    translation: { type: 'string' },
    hskLevel: { type: ['number', 'null'] },
    audioUrl: { type: ['string', 'null'] },
    mnemonic: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          chinese: { type: 'string' },
          russian: { type: 'string' },
        },
      },
    },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          color: { type: ['string', 'null'] },
        },
      },
    },
  },
  required: ['id', 'character', 'pinyin', 'translation'],
} as const;

// Экспортируются для тестов (F20): тест создаёт изолированные базы
// с реальными схемами вместо синглтона 'hanzi'.
export { WORDS_SCHEMA };

const PROGRESS_SCHEMA = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    userId: { type: 'string' },
    wordId: { type: 'string' },
    state: { type: 'string' },
    stability: { type: 'number' },
    difficulty: { type: 'number' },
    reps: { type: 'number' },
    dueDate: { type: 'string' },
    lastReviewDate: { type: 'string' },
  },
  required: ['id', 'userId', 'wordId', 'state'],
} as const;

const PENDING_CHANGES_SCHEMA = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    type: { type: 'string' },
    payload: { type: 'object' },
    isSynced: { type: 'boolean' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'type', 'payload', 'isSynced'],
} as const;

/**
 * Тип документа коллекции `progress`. Нужен sync-merge и локальному
 * пересчёту FSRS, чтобы поля (в т.ч. `lastReviewDate`) были
 * типизированы без `as any`-кастов (fix v0.4 §40 follow-up).
 * `lastReviewDate: null` — у ещё не повторённого слова (сервер шлёт
 * null в ServerChange).
 */
export interface ProgressDoc {
  id: string;
  userId: string;
  wordId: string;
  state: string;
  stability: number;
  difficulty: number;
  reps: number;
  dueDate: string;
  lastReviewDate: string | null;
}

export type DbCollections = {
  words: RxCollection;
  progress: RxCollection<ProgressDoc>;
  pending_changes: RxCollection;
};

let dbInstance: RxDatabase<DbCollections> | null = null;
let dbPromise: Promise<RxDatabase<DbCollections>> | null = null;

function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () =>
      reject(request.error ?? new Error(`Failed to delete IndexedDB ${name}`));
    request.onsuccess = () => resolve();
    // blocked = другую вкладку держит базу: резолв здесь маскировал
    // неудачное удаление и выливался в повторную ошибку инициализации.
    request.onblocked = () =>
      reject(new Error('IndexedDB delete blocked by another open tab'));
  });
}

/**
 * F19: решение о «сбросе» локальной базы принимается только при
 * несовместимости схемы (коллекции изменились, версия БД выше).
 * Любая другая ошибка инициализации (quota, private mode, транзиентная)
 * НЕ должна стирать базу — иначе теряются pending-изменения и локальный
 * прогресс, которые существуют только на устройстве.
 */
export function isSchemaMismatchError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'VersionError' || error.name === 'SchemaError';
  }
  const err = error as { code?: string; name?: string; message?: string };
  const code = err.code ?? '';
  const name = err.name ?? '';
  const message = err.message ?? '';
  return code === 'DB_SCHEMA_MISMATCH' || /schema|version error/i.test(`${name} ${message}`);
}

function openIndexedDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error ?? new Error(`Failed to open IndexedDB ${name}`));
    request.onsuccess = () => resolve(request.result);
  });
}

function getAllFromStore(store: IDBObjectStore): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error ?? new Error('Failed to read IndexedDB store'));
    request.onsuccess = () => resolve(request.result as unknown[]);
  });
}

/**
 * F19: перед разрушительным rebuild читает коллекции, которые
 * существуют только локально — очередь pending-изменений и зеркало
 * прогресса. Словарь words — серверный контент, перекачивается заново,
 * его спасать не нужно. Если чтение падает (например, хранилище
 * повреждено) — возвращаем пустые данные, не блокируя восстановление.
 */
async function rescueLocalData(): Promise<Record<string, unknown[]>> {
  const rescued: Record<string, unknown[]> = {};
  try {
    const db = await openIndexedDb('hanzi');
    try {
      const tx = db.transaction(['pending_changes', 'progress'], 'readonly');
      for (const name of ['pending_changes', 'progress'] as const) {
        try {
          rescued[name] = await getAllFromStore(tx.objectStore(name));
        } catch {
          rescued[name] = [];
        }
      }
    } finally {
      db.close();
    }
  } catch {
    // База недоступна для чтения — rebuild всё равно нужен.
  }
  return rescued;
}

async function restoreLocalData(
  db: RxDatabase<DbCollections>,
  rescued: Record<string, unknown[]>,
): Promise<void> {
  try {
    const pending = rescued['pending_changes'] ?? [];
    if (pending.length > 0) {
      await db.pending_changes.bulkInsert(pending as never[]);
    }
    const progress = rescued['progress'] ?? [];
    if (progress.length > 0) {
      await db.progress.bulkInsert(progress as ProgressDoc[]);
    }
  } catch (error) {
    // Документы, не прошедшие валидацию новой схемы, теряются
    // выборочно — не блокируем запуск из-за одного битого документа.
    console.warn('Failed to restore local data after schema rebuild:', error);
  }
}

async function createDatabase(): Promise<RxDatabase<DbCollections>> {
  const db = await createRxDatabase<DbCollections>({
    name: 'hanzi',
    storage: getRxStorageDexie(),
    closeDuplicates: true,
  } as any);

  await db.addCollections({
    words: { schema: WORDS_SCHEMA },
    progress: { schema: PROGRESS_SCHEMA },
    pending_changes: { schema: PENDING_CHANGES_SCHEMA },
  });

  return db;
}

export async function resetLocalDatabase(): Promise<void> {
  try {
    if (dbInstance) {
      await (dbInstance as any).destroy?.();
    }
  } finally {
    dbInstance = null;
    dbPromise = null;
    await deleteIndexedDb('hanzi');
  }
}

export async function clearWordsCollection(): Promise<void> {
  const db = dbInstance ?? (await initDb());
  const docs = await db.words.find().exec();
  await Promise.all(docs.map((doc) => doc.remove()));
}

/**
 * F07: стирает локальные данные аккаунта — очередь pending-изменений и
 * зеркало прогресса. Вызывается при logout: чужие ответы и прогресс не
 * должны пережить смену аккаунта (иначе ответы аккаунта A улетели бы
 * на сервер под токеном аккаунта B). Словарь слов (words) — общий
 * контент, не трогается.
 */
export async function clearAccountLocalData(): Promise<void> {
  const db = dbInstance;
  if (!db) return;
  for (const name of ['pending_changes', 'progress'] as const) {
    const docs = await db[name].find().exec();
    await Promise.all(docs.map((doc) => doc.remove()));
  }
}

export async function initDb(): Promise<RxDatabase<DbCollections>> {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    try {
      dbInstance = await createDatabase();
      return dbInstance;
    } catch (error) {
      dbInstance = null;

      // F19: стираем локальную базу ТОЛЬКО при несовместимости схемы —
      // тогда rebuild неизбежен. Прочие ошибки пробрасываем без удаления:
      // pending-изменения и прогресс переживают транзиентный сбой.
      if (!isSchemaMismatchError(error)) throw error;

      // Schema mismatch: старые коллекции не открываются новой схемой.
      // Сначала спасаем данные, существующие только локально (F19),
      // затем сбрасываем базу и пересоздаём с чистого листа.
      const rescued = await rescueLocalData();
      await deleteIndexedDb('hanzi');

      dbInstance = await createDatabase();
      await restoreLocalData(dbInstance, rescued);
      return dbInstance;
    } finally {
      dbPromise = null;
    }
  })();

  return dbPromise;
}

export function getDb(): RxDatabase<DbCollections> | null {
  return dbInstance;
}
