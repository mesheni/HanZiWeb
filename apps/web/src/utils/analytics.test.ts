import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Тесты клиента аналитики не требуют jsdom: наш модуль сам проверяет
 * `typeof window === 'undefined'`, поэтому достаточно подсунуть в
 * `globalThis` минимальный набор — `window`/`localStorage`/`navigator`/`document`.
 *
 * В Node 20+ `navigator` уже есть как read-only getter, поэтому
 * используем `Object.defineProperty` и `vi.stubGlobal`.
 */

type Listener = (event: Event) => void;

class FakeEventTarget {
  private listeners = new Map<string, Set<Listener>>();
  addEventListener(name: string, fn: Listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
  }
  removeEventListener(name: string, fn: Listener) {
    this.listeners.get(name)?.delete(fn);
  }
  dispatchEvent(name: string, event: Event) {
    for (const fn of this.listeners.get(name) ?? []) fn(event);
  }
}

class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  get length() {
    return this.map.size;
  }
}

const installBrowserShim = (opts: { dnt?: string } = {}) => {
  const localStorage = new FakeStorage();
  const winTarget = new FakeEventTarget();
  const docTarget = new FakeEventTarget();

  const win = {
    localStorage,
    addEventListener: winTarget.addEventListener.bind(winTarget),
    removeEventListener: winTarget.removeEventListener.bind(winTarget),
    dispatchEvent: winTarget.dispatchEvent.bind(winTarget),
  };

  const doc = {
    addEventListener: docTarget.addEventListener.bind(docTarget),
    removeEventListener: docTarget.removeEventListener.bind(docTarget),
    dispatchEvent: docTarget.dispatchEvent.bind(docTarget),
    visibilityState: 'visible' as 'visible' | 'hidden',
  };

  const fakeNavigator = { doNotTrack: opts.dnt };

  // window/document/localStorage — defineProperty на случай, если они
  // read-only в новых Node. configurable:true позволяет переустановить.
  const define = (key: string, value: unknown) => {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  };

  define('window', win);
  define('document', doc);
  define('localStorage', localStorage);
  define('navigator', fakeNavigator);

  return { win, doc, localStorage };
};

const uninstallBrowserShim = () => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).localStorage;
  // navigator — оставляем как было (Node 20+ имеет встроенный).
};

const importModule = async () => {
  vi.resetModules();
  // В vitest по умолчанию import.meta.env.DEV === true, что в нашем
  // модуле отключает аналитику. Для тестов аналитики принудительно
  // включаем через переменную окружения Vite.
  vi.stubEnv('VITE_ANALYTICS_ENABLED', '1');
  return import('./analytics');
};

describe('analytics (client)', () => {
  beforeEach(() => {
    installBrowserShim();
  });

  afterEach(() => {
    uninstallBrowserShim();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('flushes immediately when buffer is full', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { analytics } = await importModule();

    for (let i = 0; i < 50; i++) {
      analytics.track('session_started', { i });
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.events).toHaveLength(50);
    expect(body.events[0].name).toBe('session_started');
  });

  it('groups events into a batch (one fetch per flush)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { analytics, trackSessionStarted, trackAnswerRated } = await importModule();

    trackSessionStarted({
      sessionId: 's1',
      mode: 'mixed',
      practiceType: 'flip-card',
      cardCount: 20,
    });
    trackAnswerRated({
      sessionId: 's1',
      wordId: 'w1',
      rating: 3,
      isCorrect: true,
      responseTimeMs: 1234,
      practiceType: 'flip-card',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    await analytics.flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    expect(body.events.map((e: { name: string }) => e.name)).toEqual([
      'session_started',
      'answer_rated',
    ]);
    expect(body.events[0].properties.card_count).toBe(20);
    expect(body.events[1].properties.is_correct).toBe(true);
  });

  it('uses a stable anonymous distinctId from localStorage', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { analytics, trackSessionStarted } = await importModule();
    trackSessionStarted({ sessionId: 's', mode: 'm', practiceType: 'p', cardCount: 1 });
    trackSessionStarted({ sessionId: 's', mode: 'm', practiceType: 'p', cardCount: 1 });
    await analytics.flush();

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    const distinctIds = new Set(body.events.map((e: { distinctId: string }) => e.distinctId));
    expect(distinctIds.size).toBe(1);
  });

  it('POSTs to /api/ingest with content-type application/json', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { analytics, trackSessionStarted } = await importModule();
    trackSessionStarted({ sessionId: 's', mode: 'm', practiceType: 'p', cardCount: 1 });
    await analytics.flush();

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/ingest');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init?.credentials).toBe('include');
  });

  it('returns events to the buffer on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const { analytics, trackSessionStarted } = await importModule();
    trackSessionStarted({ sessionId: 's', mode: 'm', practiceType: 'p', cardCount: 1 });
    await analytics.flush();

    trackSessionStarted({ sessionId: 's', mode: 'm', practiceType: 'p', cardCount: 1 });
    trackSessionStarted({ sessionId: 's', mode: 'm', practiceType: 'p', cardCount: 1 });
    trackSessionStarted({ sessionId: 's', mode: 'm', practiceType: 'p', cardCount: 1 });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const fetchSpy = vi.mocked(globalThis.fetch);
    await analytics.flush();

    const body = JSON.parse(String(fetchSpy.mock.calls.at(-1)![1]?.body));
    expect(body.events).toHaveLength(4);
  });

  it('is a no-op when opt-out flag is set in localStorage', async () => {
    localStorage.setItem('hanzi:analytics-disabled', '1');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { analytics, trackSessionStarted } = await importModule();
    expect(analytics.isEnabled()).toBe(false);

    trackSessionStarted({ sessionId: 's', mode: 'm', practiceType: 'p', cardCount: 1 });
    await analytics.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when navigator.doNotTrack is "1"', async () => {
    installBrowserShim({ dnt: '1' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { analytics, trackSessionStarted } = await importModule();
    expect(analytics.isEnabled()).toBe(false);

    trackSessionStarted({ sessionId: 's', mode: 'm', practiceType: 'p', cardCount: 1 });
    await analytics.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('setEnabled toggles the opt-out flag', async () => {
    const { analytics } = await importModule();
    expect(analytics.isEnabled()).toBe(true);

    analytics.setEnabled(false);
    expect(localStorage.getItem('hanzi:analytics-disabled')).toBe('1');
    expect(analytics.isEnabled()).toBe(false);

    analytics.setEnabled(true);
    expect(localStorage.getItem('hanzi:analytics-disabled')).toBeNull();
    expect(analytics.isEnabled()).toBe(true);
  });

  it('sanitizes deeply nested properties (depth limit)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { analytics } = await importModule();
    const deep = { a: { b: { c: { d: 'too deep' } } } };
    analytics.track('session_started', { extra: deep });
    await analytics.flush();

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    const props = body.events[0].properties;
    // properties ({ extra: deep }) сам находится на depth=0, поэтому
    // { a, b } видны как объект, а { c: { d } } уже truncated.
    expect(props.extra.a.b).toBe('[truncated]');
    expect(typeof props.extra.a).toBe('object');
  });

  it('is a no-op in SSR (no window)', async () => {
    uninstallBrowserShim();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { analytics, trackSessionStarted } = await importModule();
    expect(analytics.isEnabled()).toBe(false);

    trackSessionStarted({ sessionId: 's', mode: 'm', practiceType: 'p', cardCount: 1 });
    await analytics.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('trackExperimentExposed sends the experiment_exposed event with flag context', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { analytics, trackExperimentExposed } = await importModule();
    trackExperimentExposed({ flagKey: 'practice:cloze', enabled: true, reason: 'rollout' });
    trackExperimentExposed({ flagKey: 'practice:multiple-choice', enabled: false, reason: 'disabled' });
    await analytics.flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    expect(body.events.map((e: { name: string }) => e.name)).toEqual([
      'experiment_exposed',
      'experiment_exposed',
    ]);
    expect(body.events[0].properties).toEqual({
      flag_key: 'practice:cloze',
      enabled: true,
      reason: 'rollout',
    });
    expect(body.events[1].properties).toEqual({
      flag_key: 'practice:multiple-choice',
      enabled: false,
      reason: 'disabled',
    });
  });
});
