import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { StartSessionSchema, RecordAnswerSchema } from '@hanzi/shared';
import * as sessionsService from './sessions.service.js';

const RandomWordsQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(50).default(9),
  exclude: z.string().optional(),
  hskLevel: z.coerce.number().int().min(1).max(9).optional(),
  /** Целевое слово — если задано, возвращаются слова с непересекающимися иероглифами. */
  targetWordId: z.string().uuid().optional(),
});

export async function sessionsRoutes(app: FastifyInstance) {
  /** POST /sessions/start — начать новую сессию */
  app.post('/start', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = StartSessionSchema.parse(request.body);
    const session = await sessionsService.startSession(request.userId, body);
    return reply.status(201).send({ success: true, data: session });
  });

  /** POST /sessions/:id/answer — записать ответ на карточку */
  app.post<{ Params: { id: string } }>(
    '/:id/answer',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = RecordAnswerSchema.parse({
        ...(request.body as object),
        sessionId: request.params.id,
      });
      const result = await sessionsService.recordAnswer(request.userId, body);
      return reply.send({ success: true, data: result });
    },
  );

  /** GET /sessions/:id — детали сессии */
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = await sessionsService.getSession(request.userId, request.params.id);
      if (!session) {
        return reply
          .status(404)
          .send({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }
      return reply.send({ success: true, data: session });
    },
  );

  /** GET /sessions/random-words — пул случайных слов для дистракторов */
  app.get('/random-words', { preHandler: [app.authenticate] }, async (request, reply) => {
    const q = RandomWordsQuerySchema.parse(request.query);
    if (q.targetWordId) {
      const words = await sessionsService.getRandomCharacterDistractorWords(
        q.targetWordId,
        q.count,
      );
      return reply.send({ success: true, data: words });
    }
    const excludeIds = q.exclude ? q.exclude.split(',').filter(Boolean) : [];
    const words = await sessionsService.getRandomWords(excludeIds, q.count, q.hskLevel ?? null);
    return reply.send({ success: true, data: words });
  });
}
