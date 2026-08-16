import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MnemonicUpsertSchema } from '@hanzi/shared';
import * as mnemonicsService from './mnemonics.service.js';

const WordIdParams = z.object({ wordId: z.string().uuid() });

/**
 * Личные мнемоники пользователя (волновая фича v0.7):
 *  - GET  /users/me/mnemonics?wordIds=a,b,c — пакетная выборка
 *  - PUT  /users/me/mnemonics/:wordId       — создать/обновить
 *  - DELETE /users/me/mnemonics/:wordId     — удалить
 *
 * Офлайн-правки идут через sync-очередь (типы mnemonic_upsert /
 * mnemonic_delete в sync.service), эти эндпоинты — онлайн-путь и
 * актуализация кэша других устройств.
 */
export async function mnemonicsRoutes(app: FastifyInstance) {
  app.get('/users/me/mnemonics', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({ wordIds: z.string().min(1).max(1000) }).parse(request.query);
    const items = await mnemonicsService.getMnemonics(request.userId, query.wordIds);
    return reply.send({ success: true, data: { items } });
  });

  app.put(
    '/users/me/mnemonics/:wordId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { wordId } = WordIdParams.parse(request.params);
      const body = MnemonicUpsertSchema.parse(request.body);
      const mnemonic = await mnemonicsService.upsertMnemonic(request.userId, wordId, body.text);
      return reply.send({ success: true, data: mnemonic });
    },
  );

  app.delete(
    '/users/me/mnemonics/:wordId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { wordId } = WordIdParams.parse(request.params);
      await mnemonicsService.deleteMnemonic(request.userId, wordId);
      return reply.status(204).send();
    },
  );
}
