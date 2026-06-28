import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  CreateWordSchema,
  UpdateWordSchema,
  WordFiltersSchema,
  type WordFilters,
} from '@hanzi/shared';
import { loadConfig } from '../../config.js';
import * as wordsService from './words.service.js';

export async function wordsRoutes(app: FastifyInstance) {
  /** GET /words — список слов с фильтрацией */
  app.get<{ Querystring: WordFilters }>('/', async (request, reply) => {
    const filters = WordFiltersSchema.parse(request.query);
    const result = await wordsService.listWords(filters);
    return reply.send({ success: true, data: result.data, pagination: result.pagination });
  });

  /** GET /words/:id — одно слово (опционально включает userProgress) */
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    let userId: string | undefined;

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const config = loadConfig();
        const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as { sub: string };
        userId = payload.sub;
      } catch {
        // token invalid or expired — proceed without userId
      }
    }

    const word = await wordsService.getWord(request.params.id, userId);
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
