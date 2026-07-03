import { FastifyInstance } from 'fastify';
import { CreateTagSchema, SetWordTagsSchema } from '@hanzi/shared';
import * as tagsService from './tags.service.js';

export async function tagsRoutes(app: FastifyInstance) {
  /** GET /tags — список всех тегов с подсчётом слов */
  app.get('/', { preHandler: [app.authenticate] }, async () => {
    const tags = await tagsService.listTags();
    return { success: true, data: tags };
  });

  /** POST /tags — создать тег */
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = CreateTagSchema.parse(request.body);
    const tag = await tagsService.createTag(body);
    return reply.status(201).send({ success: true, data: tag });
  });

  /** DELETE /tags/:id — удалить тег */
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request) => {
      const result = await tagsService.deleteTag(request.params.id);
      return { success: true, data: result };
    },
  );

  /** GET /words/:wordId/tags — теги слова */
  app.get<{ Params: { wordId: string } }>(
    '/words/:wordId/tags',
    { preHandler: [app.authenticate] },
    async (request) => {
      const tags = await tagsService.getWordTags(request.params.wordId);
      return { success: true, data: tags };
    },
  );

  /** PUT /words/:wordId/tags — заменить набор тегов слова */
  app.put<{ Params: { wordId: string } }>(
    '/words/:wordId/tags',
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = SetWordTagsSchema.parse(request.body);
      const tags = await tagsService.setWordTags(request.params.wordId, body.tagIds);
      return { success: true, data: tags };
    },
  );
}
