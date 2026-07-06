import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { WordModel, ProgressModel, PendingChangeModel } from './models';

const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'words',
      columns: [
        { name: 'character', type: 'string' },
        { name: 'pinyin', type: 'string' },
        { name: 'translation', type: 'string' },
        { name: 'hsk_level', type: 'number', isOptional: true },
        { name: 'audio_url', type: 'string', isOptional: true },
        { name: 'mnemonic', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'examples', type: 'string' },
        { name: 'tags', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'progress',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'word_id', type: 'string', isIndexed: true },
        { name: 'state', type: 'string' },
        { name: 'stability', type: 'number' },
        { name: 'difficulty', type: 'number' },
        { name: 'reps', type: 'number' },
        { name: 'due_date', type: 'string' },
        { name: 'last_review_date', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'pending_changes',
      columns: [
        { name: 'change_id', type: 'string', isIndexed: true },
        { name: 'type', type: 'string' },
        { name: 'payload', type: 'string' },
        { name: 'is_synced', type: 'boolean', isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});

let dbInstance: Database | null = null;
let dbPromise: Promise<Database> | null = null;

export async function getDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const adapter = new SQLiteAdapter({
      schema,
      dbName: 'hanzi-mobile',
      jsi: true,
      onSetUpError: (error) => {
        // eslint-disable-next-line no-console
        console.error('WatermelonDB setup error', error);
      },
    });

    dbInstance = new Database({
      adapter,
      modelClasses: [WordModel, ProgressModel, PendingChangeModel],
    });
    return dbInstance;
  })();

  return dbPromise;
}

export type AppDatabase = Database;
