import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AddPriorityWordsSchema } from '@hanzi/shared';
import * as readingService from './reading.service.js';

const ListQuerySchema = z.object({
  hskLevel: z.coerce.number().int().min(1).max(6).optional(),
});

const TextIdParamSchema = z.object({
  id: z.string().uuid(),
});

export async function readingRoutes(app: FastifyInstance) {
  app.get('/texts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    const data = await readingService.listTexts(request.userId, query.hskLevel);
    return reply.send({ success: true, data });
  });

  app.get<{ Params: { id: string } }>('/texts/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    TextIdParamSchema.parse(request.params);
    const data = await readingService.getText(request.userId, request.params.id);
    if (!data) {
      return reply
        .status(404)
        .send({ success: false, error: { code: 'NOT_FOUND', message: 'Text not found' } });
    }
    return reply.send({ success: true, data });
  });

  app.post<{ Params: { id: string } }>(
    '/texts/:id/priority-words',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      TextIdParamSchema.parse(request.params);
      const body = AddPriorityWordsSchema.parse(request.body);
      const added = await readingService.addPriorityWords(request.userId, request.params.id, body.wordIds);
      return reply.send({ success: true, data: { added } });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/texts/:id/progress',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      TextIdParamSchema.parse(request.params);
      await readingService.markRead(request.userId, request.params.id);
      return reply.send({ success: true });
    },
  );
}
