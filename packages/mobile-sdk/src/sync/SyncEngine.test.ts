import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncEngine } from './SyncEngine';
import { createMemoryQueueStorage } from './QueueStorage';
import { setNetworkAdapter, getNetworkAdapter } from '../network/NetworkAdapter';
import { setSecureStorage } from '../storage/SecureStorage';
import type { ApiClient, ApiResult } from '../api/ApiClient';
import type { ServerChange, SyncResponse } from '@hanzi/shared';

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
      data: {
        results: [
          {
            changeId: 'id-1',
            outcome: 'applied',
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 5,
            newState: 'learning',
            newDueDate: new Date().toISOString(),
            intervalDays: 0,
            xpGain: 0,
          },
        ],
        serverChanges: [],
      },
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
            outcome: 'applied',
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 5,
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
    const api = makeApiMock(async () => ({
      ok: true,
      status: 200,
      data: { results: [], serverChanges: [] },
    }));

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
            outcome: 'applied',
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 5,
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
      difficulty: 3,
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
            outcome: 'applied',
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 5,
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

  it('rejects malformed serverChanges (contract drift §40) and retries instead of forwarding', async () => {
    const api = makeApiMock(async (body) => {
      const changes = body.changes as Array<{ id: string }>;
      return {
        ok: true,
        status: 200,
        data: {
          results: changes.map((c) => ({
            changeId: c.id,
            outcome: 'applied',
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 5,
            newState: 'learning',
            newDueDate: new Date().toISOString(),
            intervalDays: 0,
            xpGain: 0,
          })),
          // Дрифт: неизвестный state не пройдёт ServerChangeSchema.
          serverChanges: [
            {
              wordId: 'w1',
              state: 'bogus-state',
              stability: 1,
              difficulty: 3,
              reps: 1,
              dueDate: new Date().toISOString(),
              lastReviewDate: null,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      };
    });

    const handler = vi.fn();
    const engine = new SyncEngine({ api, storage, idFactory, initialRetryDelay: 1 });
    engine.setOnServerChange(handler);
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 3 });
    await engine.flush();

    // Дрифт не должен доехать до подписчиков локального хранилища.
    expect(handler).not.toHaveBeenCalled();
    // Разбор упал → retry с бэкоффом (за 10ms с задержками 1→2→4мс
    // может успеть 2-4 вызова — проверяем минимум, не точное число).
    await new Promise((r) => setTimeout(r, 10));
    expect(api.post.mock.calls.length).toBeGreaterThanOrEqual(2);

    engine.destroy();
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
            outcome: 'applied',
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 5,
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

  it('sends sinceTimestamp on the second sync after a successful first flush (PLAN_Features_v0.4 §48)', async () => {
    const serverChange: ServerChange = {
      wordId: 'w1',
      state: 'review',
      stability: 5,
      difficulty: 3,
      reps: 2,
      dueDate: new Date().toISOString(),
      lastReviewDate: new Date().toISOString(),
      timestamp: '2026-07-01T00:00:00.000Z',
    };
    let first = true;
    const api = makeApiMock(async (body) => {
      const changes = body.changes as Array<{ id: string }>;
      const isFirst = first;
      first = false;
      return {
        ok: true,
        status: 200,
        data: {
          results: changes.map((c) => ({
            changeId: c.id,
            outcome: 'applied',
            wordId: 'w1',
            newStability: 1,
            newDifficulty: 5,
            newState: 'learning',
            newDueDate: new Date().toISOString(),
            intervalDays: 0,
            xpGain: 0,
          })),
          serverChanges: isFirst ? [serverChange] : [],
        },
      };
    });

    const engine = new SyncEngine({ api, storage, idFactory });
    engine.start();
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 4 });
    await engine.flush();
    // Первый sync — без курсора (полный снапшот).
    expect(api.post.mock.calls[0]?.[1]).toMatchObject({ sinceTimestamp: undefined });

    // Второй sync — курсор продвинут до max(timestamp) serverChanges.
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 4 });
    await engine.flush();
    expect(api.post.mock.calls[1]?.[1]).toMatchObject({
      sinceTimestamp: '2026-07-01T00:00:00.000Z',
    });
    engine.destroy();
  });

  it('re-flushes after the iteration cap without an external trigger (PLAN_Features_v0.4 §49)', async () => {
    // Сервер никогда не ack'ает изменения → очередь не пуста, каждый
    // flush упирается в MAX_ITERATIONS=10. Раньше после cap был тихий
    // return и pending-элементы ждали внешнего триггера.
    const api = makeApiMock(async () => ({
      ok: true,
      status: 200,
      data: { results: [], serverChanges: [] },
    }));

    const engine = new SyncEngine({
      api,
      storage,
      idFactory,
      initialRetryDelay: 1,
      maxRetryDelay: 4,
    });
    for (let i = 0; i < 12; i += 1) {
      await storage.insert({
        id: `c${i}`,
        type: 'study_answer',
        payload: { wordId: 'w1', rating: 3, timestamp: new Date().toISOString() },
        isSynced: false,
        createdAt: new Date().toISOString(),
      });
    }
    engine.start();

    const callsAfterFirstFlush = api.post.mock.calls.length;
    // Первый flush: 10 итераций → cap.
    await engine.flush();
    expect(api.post.mock.calls.length).toBeGreaterThanOrEqual(callsAfterFirstFlush + 10);

    // Без внешнего триггера scheduleRetry (1ms) должен запустить
    // ещё один flush — вызовов станет больше.
    await new Promise((r) => setTimeout(r, 20));
    expect(api.post.mock.calls.length).toBeGreaterThan(callsAfterFirstFlush + 10);

    engine.destroy();
  });

  it('destroy() removes the network subscription and clears the retry timer', () => {
    const api = makeApiMock(async () => ({
      ok: true,
      status: 200,
      data: { results: [], serverChanges: [] },
    }));
    const engine = new SyncEngine({ api, storage, idFactory });
    engine.start();
    expect(getNetworkAdapter()).toBe(network as never);
    engine.destroy();
    // Going online should no longer trigger a flush.
    network.go(false);
    network.go(true);
    expect(api.post).not.toHaveBeenCalled();
  });

  // ─── F07: изоляция очереди/курсора по аккаунту ───────────────────

  function makeMemorySecureStorage(): {
    data: Map<string, string>;
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem(k: string): void;
  } {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
      },
      removeItem: (k) => {
        data.delete(k);
      },
    };
  }

  const serverChangeWith = (timestamp: string): ServerChange => ({
    wordId: 'w1',
    state: 'learning',
    stability: 1,
    difficulty: 5,
    reps: 1,
    dueDate: '2026-01-01T00:00:00.000Z',
    lastReviewDate: timestamp,
    timestamp,
  });

  it('F07: курсор хранится per-user — смена аккаунта не видит чужой курсор', async () => {
    const sec = makeMemorySecureStorage();
    setSecureStorage(sec);
    const sentSince: string[] = [];
    const api = makeApiMock(async (body) => {
      sentSince.push(body.sinceTimestamp as string | undefined);
      const first = body.changes[0] as { id: string } | undefined;
      return {
        ok: true,
        status: 200,
        data: {
          results: [
            {
              changeId: first?.id ?? '',
              outcome: 'applied',
              wordId: 'w1',
              newStability: 1,
              newDifficulty: 5,
              newState: 'learning',
              newDueDate: '2026-01-01T00:00:00.000Z',
              intervalDays: 0,
              xpGain: 0,
            },
          ],
          serverChanges: [serverChangeWith('2026-01-01T00:00:00.000Z')],
        } as SyncResponse,
      };
    });

    const engine = new SyncEngine({ api, storage, idFactory });
    engine.setCurrentUserId('user-a');
    engine.start();

    // Первый flush аккаунта A: курсора нет → полный снапшот.
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 4 });
    await engine.flush();
    expect(sentSince.at(-1)).toBeUndefined();
    expect(sec.data.get('hanzi:sync:last-sync-at:user-a')).toBe('2026-01-01T00:00:00.000Z');

    // Смена аккаунта на B: чужой курсор (A) не читается → снова снапшот.
    engine.setCurrentUserId('user-b');
    await engine.enqueueChange('study_answer', { wordId: 'w2', rating: 4 });
    await engine.flush();
    expect(sentSince.at(-1)).toBeUndefined();
    expect(sec.data.has('hanzi:sync:last-sync-at:user-b')).toBe(true);

    // Возврат на A: курсор A снова подхватывается.
    engine.setCurrentUserId('user-a');
    await engine.enqueueChange('study_answer', { wordId: 'w3', rating: 4 });
    await engine.flush();
    expect(sentSince.at(-1)).toBe('2026-01-01T00:00:00.000Z');

    engine.destroy();
  });

  it('F07: clearLocalState стирает очередь и курсор аккаунта (logout)', async () => {
    const sec = makeMemorySecureStorage();
    setSecureStorage(sec);
    // Flush всегда падает — изменения остаются в pending до logout.
    const api = makeApiMock(async () => ({
      ok: false,
      status: 500,
      message: 'boom',
    }));

    const engine = new SyncEngine({ api, storage, idFactory });
    engine.setCurrentUserId('user-a');
    engine.start();
    await engine.enqueueChange('study_answer', { wordId: 'w1', rating: 4 });
    expect(await storage.count()).toBe(1);
    sec.data.set('hanzi:sync:last-sync-at:user-a', '2026-01-01T00:00:00.000Z');

    await engine.clearLocalState();

    expect(await storage.count()).toBe(0);
    expect(sec.data.has('hanzi:sync:last-sync-at:user-a')).toBe(false);
    engine.destroy();
  });
});
