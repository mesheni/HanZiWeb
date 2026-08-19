import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as examplesService from './examples.service.js';

const CreateExampleSchema = z.object({
  chinese: z.string().min(1).max(200),
  russian: z.string().min(1).max(400),
});

const RecordClozeSchema = z.object({
  exampleId: z.string().uuid(),
  correct: z.boolean(),
});

export async function examplesRoutes(app: FastifyInstance) {
  /**
   * GET /words/:wordId/examples — список примеров для слова.
   * (Префикс регистрируется в корневом /api, поэтому путь «от слова».)
   */
  app.get<{ Params: { wordId: string } }>(
    '/words/:wordId/examples',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const items = await examplesService.listExamples(request.params.wordId);
      return reply.send({ success: true, data: items });
    },
  );

  /**
   * POST /words/:wordId/examples — ручное добавление примера.
   * Примеры — общий контент словаря, поэтому write-эндпоинты только
   * для ADMIN (fix v0.4 §22 follow-up; см. words.routes.ts).
   */
  app.post<{ Params: { wordId: string } }>(
    '/words/:wordId/examples',
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const body = CreateExampleSchema.parse(request.body);
      const example = await examplesService.createExample(request.params.wordId, body);
      return reply.status(201).send({ success: true, data: example });
    },
  );

  /**
   * DELETE /words/:wordId/examples/:exampleId — удаление примера.
   * Только ADMIN: иначе любой залогиненный мог бы удалить чужие и
   * общие (hsk_audio) примеры — вандализм словаря.
   */
  app.delete<{ Params: { wordId: string; exampleId: string } }>(
    '/words/:wordId/examples/:exampleId',
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      await examplesService.deleteExample(request.params.exampleId);
      return reply.send({ success: true });
    },
  );

  /**
   * POST /cloze/attempts — записать попытку cloze-упражнения.
   */
  app.post(
    '/cloze/attempts',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = RecordClozeSchema.parse(request.body);
      const result = await examplesService.recordClozeAttempt(request.userId, body);
      return reply.send({ success: true, data: result });
    },
  );
}
