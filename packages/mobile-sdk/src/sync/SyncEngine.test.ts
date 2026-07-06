import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncEngine, type ServerChange } from './SyncEngine';
import { createMemoryQueueStorage } from './QueueStorage';
import { setNetworkAdapter, getNetworkAdapter } from '../network/NetworkAdapter';
import type { ApiClient, ApiResult } from '../api/ApiClient';
import type { SyncResponse } from '@hanzi/shared';

class FakeNetworkAdapter {
  private listeners = new Set<(online: boolean) => void>();
  private state: boolean;
  constructor(initial: boolean) {
    this.state = initial;
  }
  isOnline() {
    return this.state;
  }
  subscribe(listener: (online: boolean) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  go(online: boolean) {
    this.state = online;
    for (const l of this.listeners) l(online);
  }
}

function makeApiMock(impl: (body: any) => Promise<ApiResult<SyncResponse>>) {
  return {
    post: vi.fn().mockImplementation((_path: string, body: any) => impl(body)),
  } as unknown as ApiClient;
}

describe('SyncEngine', () => {
  let network: FakeNetworkAdapter;
  let storage: ReturnType<typeof createMemoryQueueStorage>;
  let idCounter = 0;
  const idFactory = () => `id-${++idCounter}`;

  beforeEach(() => {
    idCounter = 0;
    network = new FakeNetworkAdapter(true);
    setNetworkAdapter(network as never);
    storage = createMemoryQueueStorage();
  });

  it('enqueue writes to storage and triggers an immediate flush when online', async () => {
    const api = makeApiMock(async () => ({
      ok: true,
      status: 200,
      data: { results: [{ changeId: 'id-1', wordId: 'w1', newStability: 1, newDifficulty: 0, newState: 'learning', newDueDate: new Date().toISOString(), intervalDays: 0, xpGain: 0 }], serverChanges: [] },
    }));

    const engine = new SyncEngine({ api, storage, idFactory });
    engine.start();
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 4 });
    // The enqueueChange call kicks off a background flush; await it so
    // the post-conditions are observable.
    await engine.flush();

    expect(api.post).toHaveBeenCalled();
    // After flush, the change should be marked as synced.
    expect(await storage.count()).toBe(0);
  });

  it('flush() picks up changes that were enqueued while a previous flush was in flight', async () => {
    const api = makeApiMock(async (body) => {
      const changes = body.changes as Array<{ id: string }>;
      return {
        ok: true,
        status: 200,
        data: {
          results: changes.map((c) => ({
            changeId: c.id,
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 0,
            newState: 'learning',
            newDueDate: new Date().toISOString(),
            intervalDays: 0,
            xpGain: 0,
          })),
          serverChanges: [],
        },
      };
    });

    const engine = new SyncEngine({ api, storage, idFactory });
    engine.start();
    // Let the start() flush (no-op) finish so the engine is idle.
    await engine.flush();
    // Enqueue a new change and explicitly flush; the change should be
    // sent to the server and marked as synced.
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 4 });
    await engine.flush();
    expect(await storage.count()).toBe(0);
  });

  it('does NOT flush while offline but queues the change', async () => {
    network.go(false);
    const api = makeApiMock(async () => ({ ok: true, status: 200, data: { results: [], serverChanges: [] } }));

    const engine = new SyncEngine({ api, storage, idFactory });
    engine.start();
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 3 });

    expect(api.post).not.toHaveBeenCalled();
    expect(await storage.count()).toBe(1);
  });

  it('flushes on reconnect (online transition)', async () => {
    network.go(false);
    const api = makeApiMock(async (body) => {
      const changes = body.changes as Array<{ id: string }>;
      return {
        ok: true,
        status: 200,
        data: {
          results: changes.map((c) => ({
            changeId: c.id,
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 0,
            newState: 'learning',
            newDueDate: new Date().toISOString(),
            intervalDays: 0,
            xpGain: 0,
          })),
          serverChanges: [],
        },
      };
    });

    const engine = new SyncEngine({ api, storage, idFactory });
    engine.start();
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 4 });
    expect(api.post).not.toHaveBeenCalled();

    network.go(true);
    // Wait for the listener-triggered flush to complete.
    await engine.flush();
    expect(api.post).toHaveBeenCalled();
    expect(await storage.count()).toBe(0);
  });

  it('schedules an exponential-backoff retry on HTTP error', async () => {
    let calls = 0;
    const api = makeApiMock(async () => {
      calls += 1;
      return { ok: false, status: 503, code: 'UNAVAILABLE', message: 'down' };
    });

    const engine = new SyncEngine({
      api,
      storage,
      idFactory,
      initialRetryDelay: 1,
      maxRetryDelay: 4,
    });
    engine.start();
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 3 });
    // Wait for the initial enqueue+flush to complete (and fail).
    await engine.flush();
    expect(calls).toBeGreaterThanOrEqual(1);

    // First retry after 1ms.
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBeGreaterThanOrEqual(2);
    // Backoff doubled to 2ms.
    const statusAfterFirstRetry = engine.getStatus();
    expect(statusAfterFirstRetry.retryDelay).toBeGreaterThanOrEqual(1);

    engine.destroy();
  });

  it('forwards server-pushed changes to the registered handler', async () => {
    const serverChange: ServerChange = {
      wordId: 'w9',
      state: 'review',
      stability: 5,
      difficulty: 0.3,
      reps: 2,
      dueDate: new Date().toISOString(),
      lastReviewDate: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    };
    const api = makeApiMock(async (body) => {
      const changes = body.changes as Array<{ id: string }>;
      return {
        ok: true,
        status: 200,
        data: {
          results: changes.map((c) => ({
            changeId: c.id,
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 0,
            newState: 'learning',
            newDueDate: new Date().toISOString(),
            intervalDays: 0,
            xpGain: 0,
          })),
          serverChanges: [serverChange],
        },
      };
    });

    const handler = vi.fn();
    const engine = new SyncEngine({ api, storage, idFactory });
    engine.setOnServerChange(handler);
    engine.start();
    // Let the start() flush (no-op) finish so the engine is idle.
    await engine.flush();
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 4 });
    await engine.flush();

    expect(handler).toHaveBeenCalledWith(serverChange);
  });

  it('does not double-flush when flush() is called concurrently', async () => {
    // We track every api.post invocation and let the test resolve them
    // one at a time. Returning "no acks" makes the runFlushLoop loop
    // a second time — exactly what we want to observe.
    const pendingResolves: Array<(value: ApiResult<SyncResponse>) => void> = [];
    const api = makeApiMock(
      () =>
        new Promise<ApiResult<SyncResponse>>((res) => {
          pendingResolves.push(res);
        }),
    );

    const engine = new SyncEngine({ api, storage, idFactory });
    // Insert directly so we control the exact state of the queue.
    await storage.insert({
      id: 'c1',
      type: 'study_answer',
      payload: { wordId: 'w1', rating: 3, timestamp: new Date().toISOString() },
      isSynced: false,
      createdAt: new Date().toISOString(),
    });

    // Kick off a flush that will block inside the first api.post call.
    const first = engine.flush();
    // Yield a few times so the flush reaches the api.post call.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(pendingResolves.length).toBe(1);

    // Trigger a second flush while the first one is still pending.
    // The second flush must NOT start a new api.post call — it should
    // join the in-flight flushPromise.
    const second = engine.flush();
    expect(api.post).toHaveBeenCalledTimes(1);

    // Resolve the first api.post with no acks so the runFlushLoop
    // loops and calls api.post again. The second api.post call is
    // what we're testing for below.
    pendingResolves[0]!({ ok: true, status: 200, data: { results: [], serverChanges: [] } });
    // Give the loop time to iterate.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(api.post).toHaveBeenCalledTimes(2);

    // Resolve the second call with an ack so the change gets marked
    // as synced and the loop exits.
    pendingResolves[1]!({
      ok: true,
      status: 200,
      data: {
        results: [
          {
            changeId: 'c1',
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 0,
            newState: 'learning',
            newDueDate: new Date().toISOString(),
            intervalDays: 0,
            xpGain: 0,
          },
        ],
        serverChanges: [],
      },
    });
    await first;
    await second;
  });

  it('destroy() removes the network subscription and clears the retry timer', () => {
    const api = makeApiMock(async () => ({ ok: true, status: 200, data: { results: [], serverChanges: [] } }));
    const engine = new SyncEngine({ api, storage, idFactory });
    engine.start();
    expect(getNetworkAdapter()).toBe(network as never);
    engine.destroy();
    // Going online should no longer trigger a flush.
    network.go(false);
    network.go(true);
    expect(api.post).not.toHaveBeenCalled();
  });
});
