import { loadConfig } from '../../config.js';
import type { AnalyticsEventInput, AnalyticsIngest } from '@hanzi/shared';

/**
 * Сервис аналитики (PLAN_Features_v0.2 §14).
 *
 * Клиент никогда не обращается к PostHog напрямую — иначе в браузере
 * утекает `ph_*` cookie и project API key. Вместо этого он шлёт
 * `POST /api/ingest`, а сервер уже сам проксирует события в PostHog
 * `POST {host}/capture/` с серверным API-ключом.
 *
 * Конфигурация:
 *  - `POSTHOG_API_KEY` — Project API Key. Если не задан, `forward()`
 *    возвращает `{ forwarded: 0, skipped: count }` и события тихо
 *    отбрасываются (200). Это позволяет дев-окружению работать
 *    без внешних сервисов.
 *  - `POSTHOG_HOST` — host PostHog (по умолчанию EU-облако).
 *
 * Формат payload PostHog (`/capture/`):
 *  ```json
 *  {
 *    "api_key": "phc_...",
 *    "event": "session_started",
 *    "distinct_id": "uuid",
 *    "timestamp": "2026-07-04T10:00:00.000Z",
 *    "properties": { "$lib": "hanzi-web", ...clientProps }
 *  }
 *  ```
 */

export interface ForwardResult {
  /** Сколько событий успешно доставлено в PostHog. */
  forwarded: number;
  /** Сколько событий пропущено (no-op или ошибка upstream). */
  skipped: number;
  /** Текст ошибки upstream'а (если был). */
  upstreamError?: string;
}

export interface ForwardOptions {
  /** Авторизованный userId (если есть) — будет использован как distinct_id. */
  userId?: string;
  /** Lib-тег для группировки в PostHog. */
  lib?: string;
  /** Фиксированный distinct_id для анонимных пользователей (UUID). */
  anonymousId?: string;
}

/** Проверяет, сконфигурирован ли PostHog на сервере. */
export function isAnalyticsConfigured(): boolean {
  return Boolean(loadConfig().POSTHOG_API_KEY);
}

/**
 * Проксирует батч событий в PostHog `/capture/`.
 *
 * Особенности:
 *  - Не пробрасывает заголовки клиента: использует только серверный
 *    `Authorization` с `POSTHOG_API_KEY`. Это и есть основная причина
 *    существования прокси — чтобы в PostHog не утекали
 *    `cookie`/`authorization`/etc.
 *  - Если PostHog не сконфигурирован — возвращает 0/skipped без сети.
 *  - Если PostHog ответил 4xx/5xx — возвращает ошибку, но
 *    клиенту всё равно вернётся 2xx (см. routes), чтобы события
 *    не блокировали основной поток.
 */
export async function forward(
  input: AnalyticsIngest,
  options: ForwardOptions = {},
): Promise<ForwardResult> {
  const config = loadConfig();
  const apiKey = config.POSTHOG_API_KEY;

  if (!apiKey) {
    return { forwarded: 0, skipped: input.events.length };
  }

  const host = config.POSTHOG_HOST.replace(/\/+$/, '');
  const lib = options.lib ?? 'hanzi-server';

  let forwarded = 0;
  let upstreamError: string | undefined;

  // PostHog принимает массив событий через /batch/ или одиночные
  // через /capture/. Используем /batch/ — он атомарнее и не теряет
  // события при частичных сбоях.
  const batch: unknown[] = [];
  for (const ev of input.events) {
    batch.push(buildPostHogEvent(ev, options, apiKey, lib));
  }

  try {
    const res = await fetch(`${host}/batch/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // PostHog поддерживает оба варианта авторизации.
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      upstreamError = `posthog ${res.status}: ${text.slice(0, 200)}`;
    } else {
      forwarded = input.events.length;
    }
  } catch (err) {
    upstreamError = err instanceof Error ? err.message : 'network error';
  }

  return {
    forwarded,
    skipped: input.events.length - forwarded,
    ...(upstreamError ? { upstreamError } : {}),
  };
}

function buildPostHogEvent(
  ev: AnalyticsEventInput,
  options: ForwardOptions,
  apiKey: string,
  lib: string,
): Record<string, unknown> {
  // Приоритет distinct_id: server userId → client distinctId → anonymous.
  const distinctId = options.userId ?? ev.distinctId ?? options.anonymousId ?? 'anonymous';

  return {
    api_key: apiKey,
    event: ev.name,
    distinct_id: distinctId,
    ...(ev.timestamp ? { timestamp: ev.timestamp } : {}),
    properties: {
      $lib: lib,
      ...(options.userId ? { $user_id: options.userId } : {}),
      ...(ev.properties ?? {}),
    },
  };
}
