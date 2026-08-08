/** Мс в сутках — для elapsed-времени в FSRS (PLAN_Features_v0.4 §35). */
export const MS_PER_DAY = 86_400_000;

/**
 * F04: приводит клиентский таймстемп ответа к серверной шкале.
 *
 * Сервер — источник истины для таймстемпов: клиентское время разрешено
 * только для расчёта «офлайн-elapsed», но не может быть в будущем.
 * `undefined`/невалидное значение → серверное время.
 */
export function sanitizeClientTimestamp(
  clientMs: number | undefined,
  serverNowMs: number,
): number {
  if (clientMs === undefined || !Number.isFinite(clientMs)) return serverNowMs;
  return Math.min(clientMs, serverNowMs);
}

/**
 * F04: elapsed для FSRS с серверной границей.
 *
 * Клиентское время ответа используется только для реального офлайн-
 * промежутка, но ограничено сверху серверным elapsed: претендовать на
 * больший промежуток, чем прошёл с последнего ответа по серверным
 * часам, легитимно нельзя — иначе клиент накручивал бы дефицит
 * retrievability (низкая R при успешном ответе = лавинный рост
 * stability).
 *
 * Возвращает дни (0 при отсутствии последнего повторения).
 */
export function computeElapsedDays(
  lastReviewMs: number,
  clientAnsweredAtMs: number,
  serverNowMs: number,
): number {
  if (lastReviewMs <= 0) return 0;
  const clientElapsed = Math.max(0, clientAnsweredAtMs - lastReviewMs);
  const serverElapsed = Math.max(0, serverNowMs - lastReviewMs);
  return Math.min(clientElapsed, serverElapsed) / MS_PER_DAY;
}
