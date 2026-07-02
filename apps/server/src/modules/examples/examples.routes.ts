import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as examplesService from './examples.service.js';

const CreateExampleSchema = z.object({
  chinese: z.string().min(1).max(200),
  russian: z.string().min(1).max(400),
});

const FetchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(3),
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
   */
  app.post<{ Params: { wordId: string } }>(
    '/words/:wordId/examples',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = CreateExampleSchema.parse(request.body);
      const example = await examplesService.createExample(request.params.wordId, body);
      return reply.status(201).send({ success: true, data: example });
    },
  );

  /**
   * DELETE /words/:wordId/examples/:exampleId — удаление примера.
   */
  app.delete<{ Params: { wordId: string; exampleId: string } }>(
    '/words/:wordId/examples/:exampleId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      await examplesService.deleteExample(request.userId, request.params.exampleId);
      return reply.send({ success: true });
    },
  );

  /**
   * POST /words/:wordId/examples/fetch — стянуть новые примеры из Tatoeba.
   */
  app.post<{ Params: { wordId: string } }>(
    '/words/:wordId/examples/fetch',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const q = FetchQuerySchema.parse(request.query);
      try {
        const result = await examplesService.fetchExamplesFromTatoeba(request.params.wordId, {
          limit: q.limit,
        });
        return reply.send({ success: true, data: result });
      } catch (err) {
        const e = err as { statusCode?: number; code?: string; message?: string };
        if (e.statusCode) {
          return reply.status(e.statusCode).send({
            success: false,
            error: { code: e.code ?? 'ERROR', message: e.message ?? 'Upstream error' },
          });
        }
        throw err;
      }
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
