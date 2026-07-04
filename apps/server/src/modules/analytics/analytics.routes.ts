import { FastifyInstance } from 'fastify';
import { AnalyticsIngestSchema } from '@hanzi/shared';
import * as analyticsService from './analytics.service.js';

/**
 * Прокси-эндпоинт аналитики (PLAN_Features_v0.2 §14).
 *
 * `POST /ingest` — единственный путь, через который web/app отправляет
 * события в PostHog. Клиент НЕ ходит в PostHog напрямую, чтобы не
 * светить API key и не утекали cookie/authorization. Сервер сам
 * подмешивает `userId` из JWT (если есть) и шлёт батч в
 * `{POSTHOG_HOST}/batch/`.
 *
 * Возвращает всегда 2xx (204 при no-op, 200 при успехе), чтобы сбой
 * аналитики никогда не ломал основной поток обучения.
 */
export async function analyticsRoutes(app: FastifyInstance) {
  app.post('/ingest', { preHandler: [app.authenticateOptional] }, async (request, reply) => {
    const body = AnalyticsIngestSchema.parse(request.body);

    const result = await analyticsService.forward(body, {
      ...(request.userId ? { userId: request.userId } : {}),
      lib: 'hanzi-web',
    });

    // Если PostHog не сконфигурирован — отдаём 204 No Content,
    // чтобы клиент не пытался ретраить «вечно».
    if (result.skipped > 0 && result.forwarded === 0 && !result.upstreamError) {
      return reply.status(204).send();
    }

    if (result.upstreamError) {
      request.log.warn(
        { err: result.upstreamError, skipped: result.skipped },
        'Analytics upstream error',
      );
    }

    return reply.send({
      success: true,
      data: { forwarded: result.forwarded, skipped: result.skipped },
    });
  });
}
