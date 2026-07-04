import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AnalyticsIngest } from '@hanzi/shared';

// Подменяем config ДО импорта модуля, чтобы POSTHOG_API_KEY был
// управляемым в тестах.
const setApiKey = (key: string | undefined) => {
  if (key === undefined) {
    delete process.env.POSTHOG_API_KEY;
  } else {
    process.env.POSTHOG_API_KEY = key;
  }
  process.env.POSTHOG_HOST = process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com';
};

const makeEvent = (overrides: Partial<{ name: 'session_started' | 'answer_rated' | 'audio_generated'; distinctId: string; timestamp: string; properties: Record<string, unknown> }> = {}): AnalyticsIngest['events'][number] => ({
  name: 'session_started',
  distinctId: 'anon-uuid',
  timestamp: '2026-07-04T10:00:00.000Z',
  properties: { foo: 'bar' },
  ...overrides,
});

describe('analytics.service', () => {
  beforeEach(() => {
    setApiKey(undefined);
  });
  afterEach(() => {
    setApiKey(undefined);
    vi.restoreAllMocks();
  });

  describe('isAnalyticsConfigured', () => {
    it('returns false when POSTHOG_API_KEY is not set', async () => {
      setApiKey(undefined);
      const { isAnalyticsConfigured } = await import('./analytics.service.js');
      expect(isAnalyticsConfigured()).toBe(false);
    });

    it('returns true when POSTHOG_API_KEY is set', async () => {
      setApiKey('phc_test');
      const { isAnalyticsConfigured } = await import('./analytics.service.js');
      expect(isAnalyticsConfigured()).toBe(true);
    });
  });

  describe('forward (no PostHog config)', () => {
    it('returns skipped=count when API key is missing (no network call)', async () => {
      setApiKey(undefined);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const { forward } = await import('./analytics.service.js');

      const result = await forward({ events: [makeEvent(), makeEvent()] });

      expect(result).toEqual({ forwarded: 0, skipped: 2 });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('forward (with PostHog config)', () => {
    it('POSTs to {host}/batch/ with api_key and all events', async () => {
      setApiKey('phc_secret_key');
      process.env.POSTHOG_HOST = 'https://eu.i.posthog.com';
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const { forward } = await import('./analytics.service.js');

      const events = [
        makeEvent({ name: 'session_started' }),
        makeEvent({ name: 'answer_rated' }),
      ];
      const result = await forward({ events }, { lib: 'hanzi-web' });

      expect(result.forwarded).toBe(2);
      expect(result.skipped).toBe(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('https://eu.i.posthog.com/batch/');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer phc_secret_key',
      });

      const body = JSON.parse(String(init?.body));
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0]).toMatchObject({
        api_key: 'phc_secret_key',
        event: 'session_started',
        distinct_id: 'anon-uuid',
        timestamp: '2026-07-04T10:00:00.000Z',
        properties: expect.objectContaining({ $lib: 'hanzi-web', foo: 'bar' }),
      });
    });

    it('uses server userId as distinct_id (overrides client)', async () => {
      setApiKey('phc_secret_key');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const { forward } = await import('./analytics.service.js');

      await forward(
        { events: [makeEvent({ distinctId: 'wrong-id' })] },
        { userId: 'user-123' },
      );

      const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
      expect(body[0].distinct_id).toBe('user-123');
      expect(body[0].properties).toMatchObject({ $user_id: 'user-123' });
    });

    it('falls back to anonymousId when neither userId nor client distinctId', async () => {
      setApiKey('phc_secret_key');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const { forward } = await import('./analytics.service.js');

      await forward(
        { events: [{ name: 'session_started' }] },
        { anonymousId: 'anon-fallback' },
      );

      const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
      expect(body[0].distinct_id).toBe('anon-fallback');
    });

    it('does not forward any client-supplied headers to PostHog', async () => {
      setApiKey('phc_secret_key');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const { forward } = await import('./analytics.service.js');

      await forward({ events: [makeEvent()] });

      const [, init] = fetchSpy.mock.calls[0]!;
      // Только два заголовка, которые мы выставили сами. Никаких cookie/authorization.
      expect(Object.keys(init?.headers as Record<string, string>).sort()).toEqual(
        ['Authorization', 'Content-Type'],
      );
    });

    it('reports upstreamError when PostHog returns 4xx', async () => {
      setApiKey('phc_secret_key');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('forbidden', { status: 403 }),
      );

      const { forward } = await import('./analytics.service.js');

      const result = await forward({ events: [makeEvent(), makeEvent()] });
      expect(result.forwarded).toBe(0);
      expect(result.skipped).toBe(2);
      expect(result.upstreamError).toMatch(/posthog 403/);
    });

    it('reports upstreamError when fetch throws', async () => {
      setApiKey('phc_secret_key');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const { forward } = await import('./analytics.service.js');

      const result = await forward({ events: [makeEvent()] });
      expect(result.forwarded).toBe(0);
      expect(result.upstreamError).toBe('ECONNREFUSED');
    });

    it('strips trailing slashes from POSTHOG_HOST', async () => {
      setApiKey('phc_secret_key');
      process.env.POSTHOG_HOST = 'https://us.i.posthog.com///';
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const { forward } = await import('./analytics.service.js');

      await forward({ events: [makeEvent()] });

      expect(fetchSpy.mock.calls[0]![0]).toBe('https://us.i.posthog.com/batch/');
    });
  });
});
