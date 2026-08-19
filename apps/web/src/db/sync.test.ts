import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import type { SyncResponse } from '@hanzi/shared';
import { SyncEngine } from './sync';

/**
 * Trailing-flush: изменение, вставшее в очередь во время полёта
 * flush, обязано уйти следующим же flush — раньше «молчаливый выход»
 * при isSyncing оставлял последний ответ сессии в очереди до
 * следующего enqueue/online, и он терялся при закрытии вкладки.
 */

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

type TestCollections = {
  pending_changes: RxCollection;
  progress: RxCollection;
};

const mockDbRef = vi.hoisted(() => ({ db: null as RxDatabase<TestCollections> | null }));
const apiPostMock = vi.hoisted(() => vi.fn());
const authStateMock = vi.hoisted(() => ({ user: { id: 'user-1' } as { id: string } | null }));

vi.mock('./database', () => ({ getDb: () => mockDbRef.db }));
vi.mock('../api/client', () => ({ apiPost: apiPostMock }));
vi.mock('../stores/authStore', () => ({
  useAuthStore: { getState: () => authStateMock },
}));

let dbSeq = 0;
async function makeTestDb(): Promise<RxDatabase<TestCollections>> {
  const db = await createRxDatabase<TestCollections>({
    name: `hanzi-sync-test-${dbSeq++}`,
    storage: getRxStorageDexie(),
  } as any);
  await db.addCollections({
    pending_changes: { schema: PENDING_CHANGES_SCHEMA },
    progress: { schema: PROGRESS_SCHEMA },
  });
  return db;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function pendingDoc(id: string) {
  return {
    id,
    type: 'study_answer',
    payload: { wordId: 'w1', rating: 4, timestamp: new Date().toISOString() },
    isSynced: false,
    createdAt: new Date().toISOString(),
  };
}

function syncResponse(changeIds: string[]): SyncResponse {
  return {
    results: changeIds.map((id) => ({ changeId: id, outcome: 'applied', wordId: 'w1' })),
    serverChanges: [],
    nextCursor: 1,
  } as unknown as SyncResponse;
}

describe('SyncEngine.flushChanges — trailing flush', () => {
  let db: RxDatabase<TestCollections>;
  let engine: SyncEngine;

  beforeEach(async () => {
    db = await makeTestDb();
    mockDbRef.db = db;
    authStateMock.user = { id: 'user-1' };
    engine = new SyncEngine();
    apiPostMock.mockReset();
    apiPostMock.mockImplementation(() => {
      throw new Error('unexpected apiPost call');
    });
  });

  afterEach(async () => {
    engine.destroy();
    await db.remove();
  });

  it('отправляет изменение, вставшее в очередь во время полёта flush', async () => {
    await db.pending_changes.insert(pendingDoc('change-a'));

    const first = deferred<SyncResponse>();
    const second = deferred<SyncResponse>();
    apiPostMock.mockImplementationOnce(() => first.promise);
    apiPostMock.mockImplementationOnce(() => second.promise);

    const flush1 = engine.flushChanges();
    await vi.waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(1));

    // change-b приходит, пока первый flush в полёте (enqueueChange сам
    // вызывает flushChanges и должен присоединиться/trailing, не выйти).
    await engine.enqueueChange('study_answer', { wordId: 'w2', rating: 4 });

    first.resolve(syncResponse(['change-a']));
    await flush1;

    // Trailing-flush стартует сам — без нового enqueue/online.
    await vi.waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(2));

    const secondBody = apiPostMock.mock.calls[1]![1] as { changes: Array<{ id: string }> };
    expect(secondBody.changes).toHaveLength(1);
    const trailingId = secondBody.changes[0]!.id;

    second.resolve(syncResponse([trailingId]));
    await engine.flushChanges();

    const unsynced = await db.pending_changes.find({ selector: { isSynced: false } }).exec();
    expect(unsynced).toHaveLength(0);
  });

  it('параллельные вызовы flushChanges не дублируют запрос', async () => {
    await db.pending_changes.insert(pendingDoc('change-a'));

    const first = deferred<SyncResponse>();
    apiPostMock.mockImplementationOnce(() => first.promise);

    const p1 = engine.flushChanges();
    const p2 = engine.flushChanges();
    await vi.waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(1));

    first.resolve(syncResponse(['change-a']));
    await Promise.all([p1, p2]);

    expect(apiPostMock).toHaveBeenCalledTimes(1);
    const unsynced = await db.pending_changes.find({ selector: { isSynced: false } }).exec();
    expect(unsynced).toHaveLength(0);
  });
});
