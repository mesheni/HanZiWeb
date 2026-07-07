import { FastifyInstance } from 'fastify';
import {
  CreateWordSchema,
  UpdateWordSchema,
  WordFiltersSchema,
  RecentWordsQuerySchema,
  type WordFilters,
  type RecentWordsQuery,
} from '@hanzi/shared';
import * as wordsService from './words.service.js';

export async function wordsRoutes(app: FastifyInstance) {
  /** GET /words — список слов с фильтрацией */
  app.get<{ Querystring: WordFilters }>('/', { preHandler: [app.authenticateOptional] }, async (request, reply) => {
    const filters = WordFiltersSchema.parse(request.query);

    const result = await wordsService.listWords(filters, request.userId || undefined);
    return reply.send({ success: true, data: result.data, pagination: result.pagination });
  });

  /**
   * GET /words/recent — последние изученные слова текущего пользователя,
   * отсортированные по `lastReviewDate DESC` (PLAN_Features_v0.3 §17).
   * Должен быть смонтирован ДО `/:id`, иначе Fastify поймает «recent» как id.
   */
  app.get<{ Querystring: RecentWordsQuery }>(
    '/recent',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = RecentWordsQuerySchema.parse(request.query);
      const words = await wordsService.getRecentWords(request.userId, query);
      return reply.send({ success: true, data: words });
    },
  );

  /** GET /words/:id — одно слово (опционально включает userProgress) */
  app.get<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticateOptional] }, async (request, reply) => {
    const word = await wordsService.getWord(request.params.id, request.userId || undefined);
    if (!word) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Word not found' } });
    }
    return reply.send({ success: true, data: word });
  });

  /** POST /words — создание слова */
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = CreateWordSchema.parse(request.body);
    const word = await wordsService.createWord(body);
    return reply.status(201).send({ success: true, data: word });
  });

  /** PUT /words/:id — обновление */
  app.put<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = UpdateWordSchema.parse(request.body);
    const word = await wordsService.updateWord(request.params.id, body);
    return reply.send({ success: true, data: word });
  });

  /** DELETE /words/:id — удаление */
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    await wordsService.deleteWord(request.params.id);
    return reply.send({ success: true });
  });
}
