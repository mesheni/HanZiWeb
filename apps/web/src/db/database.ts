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
    hskLevel: { type: 'number' },
    audioUrl: { type: 'string' },
    mnemonic: { type: 'string' },
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

export async function initDb(): Promise<RxDatabase<DbCollections>> {
  if (dbInstance) return dbInstance;

  dbInstance = await createRxDatabase<DbCollections>({
    name: 'hanzi',
    storage: getRxStorageDexie(),
  });

  await dbInstance.addCollections({
    words: { schema: WORDS_SCHEMA },
    progress: { schema: PROGRESS_SCHEMA },
    pending_changes: { schema: PENDING_CHANGES_SCHEMA },
  });

  return dbInstance;
}

export function getDb(): RxDatabase<DbCollections> | null {
  return dbInstance;
}
