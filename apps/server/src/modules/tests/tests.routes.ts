import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { StartTestSchema, SubmitTestSchema } from '@hanzi/shared';
import * as testsService from './tests.service.js';

const TestIdParamSchema = z.object({
  id: z.string().uuid(),
});

const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function testsRoutes(app: FastifyInstance) {
  /** POST /tests/start — сгенерировать новый тест (HSK 1..6). */
  app.post('/start', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = StartTestSchema.parse(request.body);
    const session = await testsService.generateTest(request.userId, body);
    return reply.status(201).send({ success: true, data: session });
  });

  /** POST /tests/:id/submit — проверить ответы и записать TestResult. */
  app.post<{ Params: { id: string } }>(
    '/:id/submit',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      TestIdParamSchema.parse(request.params);
      const body = SubmitTestSchema.parse(request.body);
      const result = await testsService.submitTest(request.userId, request.params.id, body);
      return reply.send({ success: true, data: result });
    },
  );

  /** GET /tests/history — список последних результатов тестов пользователя. */
  app.get('/history', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = HistoryQuerySchema.parse(request.query);
    const history = await testsService.getHistory(request.userId, query.limit);
    return reply.send({ success: true, data: history });
  });
}
