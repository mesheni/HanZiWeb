import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Первый импорт rxdb в этом worker проходит через vite dev-transform
// (тысячи модулей) и занимает несколько секунд — стандартных 5s не
// хватает.
vi.setConfig({ testTimeout: 30_000 });

/**
 * F19: локальный storage (RxDB/Dexie) должен стартовать до React, а
 * initDb не должен стирать ВСЮ базу (включая pending-изменения) при
 * любой ошибке — только при несовместимости схемы, и даже тогда
 * pending_changes/progress спасаются и восстанавливаются.
 */

type DbModule = typeof import('./database');

async function loadDatabase(): Promise<DbModule> {
  vi.resetModules();
  return import('./database');
}

function dropHanzi(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('hanzi');
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** Кладёт «осиротевший» pending-документ в raw IndexedDB (как если бы
 * база была создана старой схемой, которую RxDB уже не открывает). */
async function seedRawPendingChange(doc: Record<string, unknown>): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('hanzi', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('pending_changes')) {
        request.result.createObjectStore('pending_changes', { keyPath: 'id' });
      }
      if (!request.result.objectStoreNames.contains('progress')) {
        request.result.createObjectStore('progress', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const tx = db.transaction('pending_changes', 'readwrite');
    tx.objectStore('pending_changes').put(doc);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

describe('isSchemaMismatchError (F19: решение о wipe)', () => {
  it('возвращает true только для schema/version-ошибок', async () => {
    const { isSchemaMismatchError } = await loadDatabase();

    expect(isSchemaMismatchError(new Error('boom'))).toBe(false);
    expect(isSchemaMismatchError(new DOMException('version', 'VersionError'))).toBe(true);
    expect(isSchemaMismatchError(new DOMException('schema', 'SchemaError'))).toBe(true);
    expect(isSchemaMismatchError({ code: 'DB_SCHEMA_MISMATCH' })).toBe(true);
    expect(isSchemaMismatchError({ message: 'schema mismatch detected' })).toBe(true);

    // Транзиентные/средовые ошибки НЕ должны приводить к стиранию базы.
    expect(isSchemaMismatchError(new DOMException('quota', 'QuotaExceededError'))).toBe(false);
    expect(isSchemaMismatchError({ name: 'QuotaExceededError' })).toBe(false);
    expect(isSchemaMismatchError({ message: 'request failed' })).toBe(false);
  });
});

describe('initDb (F19)', () => {
  beforeEach(async () => {
    await dropHanzi();
  });

  it('создаёт базу и принимает pending-изменения (storage готов до React)', async () => {
    const dbModule = await loadDatabase();
    const db = await dbModule.initDb();
    expect(dbModule.getDb()).toBe(db);

    await db.pending_changes.insert({
      id: 'pending-1',
      type: 'study_answer',
      payload: { wordId: 'w1', rating: 4 },
      isSynced: false,
      createdAt: new Date().toISOString(),
    });
    const docs = await db.pending_changes.find().exec();
    expect(docs).toHaveLength(1);
    expect(docs[0]?.get('type')).toBe('study_answer');

    await dbModule.resetLocalDatabase();
  });

  it('при НЕ-schema ошибке не удаляет базу и пробрасывает ошибку — pending выживает', async () => {
    const genericError = new Error('IndexedDB is blocked (private mode)');
    vi.doMock('rxdb', async (importOriginal) => {
      const orig = await importOriginal<typeof import('rxdb')>();
      return { ...orig, createRxDatabase: vi.fn().mockRejectedValue(genericError) };
    });

    const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase');
    const dbModule = await loadDatabase();

    await expect(dbModule.initDb()).rejects.toBe(genericError);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(dbModule.getDb()).toBeNull();
  });

  it('при schema-ошибке сбрасывает базу, но спасает pending_changes и восстанавливает их', async () => {
    await seedRawPendingChange({
      id: 'pending-1',
      type: 'study_answer',
      payload: { wordId: 'w1', rating: 4, timestamp: '2026-08-08T00:00:00.000Z' },
      isSynced: false,
      createdAt: '2026-08-08T00:00:00.000Z',
    });

    const schemaError = { code: 'DB_SCHEMA_MISMATCH', message: 'schema mismatch' };
    let calls = 0;
    vi.doMock('rxdb', async (importOriginal) => {
      const orig = await importOriginal<typeof import('rxdb')>();
      return {
        ...orig,
        createRxDatabase: vi.fn(async (...args: Parameters<typeof orig.createRxDatabase>) => {
          calls += 1;
          if (calls === 1) throw schemaError;
          return orig.createRxDatabase(...args);
        }),
      };
    });

    const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase');
    const dbModule = await loadDatabase();

    const db = await dbModule.initDb();
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(dbModule.getDb()).toBe(db);

    // Спасённый pending-документ восстановлен в новой базе.
    const docs = await db.pending_changes.find().exec();
    expect(docs).toHaveLength(1);
    expect(docs[0]?.id).toBe('pending-1');
    expect(docs[0]?.get('payload')).toMatchObject({ wordId: 'w1', rating: 4 });

    await dbModule.resetLocalDatabase();
  });
});
