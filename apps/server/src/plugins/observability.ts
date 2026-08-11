import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Structured observability (F27).
 *
 * - `x-request-id`: каждый ответ получает ID запроса Fastify (`req.id`) —
 *   клиент может трейсить запрос по логам сервера (pino пишет `req.id`
 *   в каждый request/response-лог).
 */
async function observabilityPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onSend', async (request, reply) => {
    if (!reply.getHeader('x-request-id')) {
      reply.header('x-request-id', request.id);
    }
  });
}

export default fp(observabilityPlugin, { name: 'observability' });
