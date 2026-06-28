import { FastifyInstance } from 'fastify';
import { StartSessionSchema, RecordAnswerSchema } from '@hanzi/shared';
import * as sessionsService from './sessions.service.js';

export async function sessionsRoutes(app: FastifyInstance) {
  /** POST /sessions/start — начать новую сессию */
  app.post('/start', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = StartSessionSchema.parse(request.body);
    const session = await sessionsService.startSession(request.userId, body);
    return reply.status(201).send({ success: true, data: session });
  });

  /** POST /sessions/:id/answer — записать ответ на карточку */
  app.post<{ Params: { id: string } }>('/:id/answer', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = RecordAnswerSchema.parse({ ...(request.body as object), sessionId: request.params.id });
    const result = await sessionsService.recordAnswer(request.userId, body);
    return reply.send({ success: true, data: result });
  });

  /** GET /sessions/:id — детали сессии */
  app.get<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const session = await sessionsService.getSession(request.userId, request.params.id);
    if (!session) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }
    return reply.send({ success: true, data: session });
  });
}
