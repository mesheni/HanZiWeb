import type {
  AnalyticsEventName,
  AnalyticsEventInput,
  AnalyticsIngest,
} from '@hanzi/shared';

/**
 * Клиент аналитики (PLAN_Features_v0.2 §14).
 *
 * Шлёт события в наш backend `POST /api/ingest` (а не в PostHog
 * напрямую), чтобы не светить API key и не утекали cookie /
 * authorization браузера. Сервер уже сам проксирует в PostHog
 * `/batch/` с серверным ключом.
 *
 * Особенности:
 *  - Анонимный `distinctId` сохраняется в localStorage (генерируется
 *    один раз через `crypto.randomUUID`).
 *  - События сначала копятся в буфере, потом отправляются
 *    одним батчем (лимит 50). Сброс также по `flush()` (например,
 *    на `beforeunload`).
 *  - Уважаем Do-Not-Track: если `navigator.doNotTrack === '1'`,
 *    аналитика выключается глобально.
 *  - Опт-аут: ключ `hanzi:analytics-disabled` в localStorage = `'1'`
 *    отключает трекинг (для UI-настройки в Settings).
 *  - В SSR/Node без `window` все методы — no-op.
 *  - В DEV-режиме без `import.meta.env.VITE_ANALYTICS_ENABLED === '1'`
 *    — no-op, чтобы не загрязнять продакшен-датасет.
 */

const ANON_ID_KEY = 'hanzi:analytics-anon-id';
const OPT_OUT_KEY = 'hanzi:analytics-disabled';
const ENDPOINT = '/api/ingest';
const MAX_BUFFER = 50;
const FLUSH_INTERVAL_MS = 5_000;
const MAX_PROPERTIES_DEPTH = 3;

type Properties = Record<string, unknown>;

interface AnalyticsInternals {
  buffer: AnalyticsEventInput[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  flushInFlight: boolean;
  isDisabled: boolean;
}

/** Снимок состояния «аналитика разрешена в этом окружении». */
function detectDisabled(): boolean {
  if (typeof window === 'undefined') return true;

  // Do-Not-Track (старые браузеры используют `yes`).
  const dnt =
    (navigator as Navigator & { doNotTrack?: string }).doNotTrack ??
    (window as Window & { doNotTrack?: string }).doNotTrack;
  if (dnt === '1' || dnt === 'yes') return true;

  try {
    if (localStorage.getItem(OPT_OUT_KEY) === '1') return true;
  } catch {
    // localStorage недоступен (приватный режим / file://)
  }

  // В dev-режиме по умолчанию выключено, если не включено явно.
  if (
    import.meta.env?.DEV &&
    import.meta.env.VITE_ANALYTICS_ENABLED !== '1'
  ) {
    return true;
  }

  return false;
}

/** Возвращает стабильный анонимный ID, сохраняя в localStorage. */
function getAnonymousId(): string {
  try {
    const existing = localStorage.getItem(ANON_ID_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ANON_ID_KEY, fresh);
    return fresh;
  } catch {
    return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Ограничивает глубину вложенности properties, чтобы нечаянно не
 * отправить цикл или гигантский объект в PostHog.
 */
function sanitize(value: unknown, depth = 0): unknown {
  if (depth >= MAX_PROPERTIES_DEPTH) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 50);
    for (const [k, v] of entries) {
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  // bigint, function, symbol и т.д.
  return String(value);
}

class AnalyticsClient {
  private state: AnalyticsInternals = {
    buffer: [],
    flushTimer: null,
    flushInFlight: false,
    isDisabled: detectDisabled(),
  };

  /** Включена ли аналитика в текущем окружении (для UI). */
  isEnabled(): boolean {
    return !this.state.isDisabled;
  }

  /** Включить/выключить аналитику из UI (Settings). */
  setEnabled(enabled: boolean): void {
    this.state.isDisabled = !enabled;
    try {
      if (enabled) {
        localStorage.removeItem(OPT_OUT_KEY);
      } else {
        localStorage.setItem(OPT_OUT_KEY, '1');
      }
    } catch {
      // ignore
    }
  }

  /**
   * Добавить событие в буфер. Если буфер заполнился — отправляет
   * немедленно. Тихо игнорирует вызовы, если аналитика отключена.
   */
  track(
    name: AnalyticsEventName,
    properties?: Properties,
    opts: { timestamp?: string } = {},
  ): void {
    if (this.state.isDisabled) return;

    const event: AnalyticsEventInput = {
      name,
      distinctId: getAnonymousId(),
      ...(opts.timestamp ? { timestamp: opts.timestamp } : { timestamp: new Date().toISOString() }),
      ...(properties ? { properties: sanitize(properties) as Properties } : {}),
    };

    this.state.buffer.push(event);

    if (this.state.buffer.length >= MAX_BUFFER) {
      void this.flush();
    } else if (!this.state.flushTimer) {
      this.state.flushTimer = setTimeout(() => {
        this.state.flushTimer = null;
        void this.flush();
      }, FLUSH_INTERVAL_MS);
    }
  }

  /**
   * Принудительная отправка буфера. Используется на `pagehide` /
   * `beforeunload`, чтобы не терять последние события.
   *
   * На unload использует `navigator.sendBeacon` (если доступен) — он
   * переживает закрытие вкладки и не блокирует UI.
   */
  async flush(useBeacon = false): Promise<void> {
    if (this.state.flushTimer) {
      clearTimeout(this.state.flushTimer);
      this.state.flushTimer = null;
    }
    if (this.state.isDisabled || this.state.buffer.length === 0) return;
    if (this.state.flushInFlight) return;

    const events = this.state.buffer.splice(0, this.state.buffer.length);
    const payload: AnalyticsIngest = { events };
    const body = JSON.stringify(payload);

    if (useBeacon && typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        const ok = navigator.sendBeacon(ENDPOINT, blob);
        if (ok) return;
        // Если sendBeacon вернул false (exceeded quota) — возвращаем
        // события в буфер, попробуем fetch при следующем шансе.
        this.state.buffer.unshift(...events);
        return;
      } catch {
        this.state.buffer.unshift(...events);
        return;
      }
    }

    this.state.flushInFlight = true;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'include',
        // keepalive помогает пережить reload/close при обычном fetch.
        keepalive: true,
      });
      if (!res.ok && res.status !== 204) {
        // Возвращаем события в буфер, чтобы попробовать позже
        // (ограничиваем размер, чтобы не утекала память).
        const room = MAX_BUFFER - this.state.buffer.length;
        if (room > 0) {
          this.state.buffer.unshift(...events.slice(0, room));
        }
      }
    } catch {
      const room = MAX_BUFFER - this.state.buffer.length;
      if (room > 0) {
        this.state.buffer.unshift(...events.slice(0, room));
      }
    } finally {
      this.state.flushInFlight = false;
    }
  }
}

export const analytics = new AnalyticsClient();

let initialized = false;

/**
 * Подключает обработчики `pagehide`/`beforeunload`/`visibilitychange`,
 * которые сбрасывают буфер. Идемпотентно — повторный вызов no-op.
 *
 * Должен вызываться ОДИН раз на старте приложения (например, из `main.tsx`).
 */
export function initAnalytics(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  initialized = true;

  // Сбрасываем буфер на закрытие/скрытие вкладки.
  const onHide = () => {
    void analytics.flush(true);
  };
  window.addEventListener('pagehide', onHide);
  window.addEventListener('beforeunload', onHide);
  // Visibility change → flush (если страница ушла в фон, события
  // могут не дойти из-за throttle'а фоновых табов).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void analytics.flush(true);
    }
  });
}

// ── Удобные фасады для конкретных событий (см. PLAN_Features_v0.2 §14) ──

/**
 * `session_started` — пользователь начал новую сессию.
 *
 * `cardCount` берётся из реального числа карточек в ответе `/sessions/start`,
 * чтобы PostHog видел распределение по длинам сессий.
 */
export function trackSessionStarted(input: {
  sessionId: string;
  mode: string;
  practiceType: string;
  cardCount: number;
  deckId?: string | null;
}): void {
  analytics.track('session_started', {
    session_id: input.sessionId,
    mode: input.mode,
    practice_type: input.practiceType,
    card_count: input.cardCount,
    deck_id: input.deckId ?? null,
  });
}

/**
 * `answer_rated` — пользователь оценил карточку.
 *
 * `isCorrect` — «не Again» (rating >= 3), нужно для конверсии.
 * `responseTimeMs` — от показа до клика, помогает находить «лёгкие» карточки.
 */
export function trackAnswerRated(input: {
  sessionId: string;
  wordId: string;
  rating: 1 | 2 | 3 | 4;
  isCorrect: boolean;
  responseTimeMs: number;
  practiceType: string;
}): void {
  analytics.track('answer_rated', {
    session_id: input.sessionId,
    word_id: input.wordId,
    rating: input.rating,
    is_correct: input.isCorrect,
    response_time_ms: Math.round(input.responseTimeMs),
    practice_type: input.practiceType,
  });
}

/**
 * `audio_generated` — пользователь прослушал аудио слова.
 *
 * `source`:
 *  - `mp3`     — проигран сгенерированный mp3 (`Word.audioUrl`).
 *  - `fallback` — браузерный `speechSynthesis` (mp3 отсутствует или
 *                 Google TTS не сконфигурирован).
 *
 * На клиенте нет способа отличить «только что сгенерированный» mp3 от
 * кэшированного (оба приходят как готовый URL), поэтому server-side
 * кейс «`POST /audio/generate`» логируется отдельно, если потребуется.
 */
export function trackAudioGenerated(input: {
  wordId: string;
  source: 'mp3' | 'fallback';
}): void {
  analytics.track('audio_generated', {
    word_id: input.wordId,
    source: input.source,
  });
}
