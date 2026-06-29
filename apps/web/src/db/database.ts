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
  },
  required: ['id', 'character', 'pinyin', 'translation'],
} as const;

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

export type DbCollections = {
  words: RxCollection;
  progress: RxCollection;
  pending_changes: RxCollection;
};

let dbInstance: RxDatabase<DbCollections> | null = null;
let dbPromise: Promise<RxDatabase<DbCollections>> | null = null;

function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error ?? new Error(`Failed to delete IndexedDB ${name}`));
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
  });
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

export async function initDb(): Promise<RxDatabase<DbCollections>> {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    try {
      dbInstance = await createDatabase();
      return dbInstance;
    } catch {
      dbInstance = null;

      // Schema mismatch or duplicate local database can leave old collections behind.
      // Clear the local database and retry once with a clean slate.
      await deleteIndexedDb('hanzi');

      dbInstance = await createDatabase();
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
