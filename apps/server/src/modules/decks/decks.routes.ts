import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateDeckSchema, UpdateDeckSchema } from '@hanzi/shared';
import { normalizeShareCode } from '../../lib/shareCode.js';
import * as decksService from './decks.service.js';

const ShareCodeParamSchema = z.object({
  code: z.string().min(4).max(16),
});

const DeckIdParamSchema = z.object({
  id: z.string().uuid(),
});

export async function decksRoutes(app: FastifyInstance) {
  /** GET / — list all decks (system + own custom) */
  app.get('/', async (_request, reply) => {
    const decks = await decksService.listDecks();
    return reply.send({ success: true, data: decks });
  });

  /** GET /:id — deck details with word list */
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const deck = await decksService.getDeckWithWords(request.params.id);
    if (!deck) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Deck not found' },
      });
    }
    return reply.send({ success: true, data: deck });
  });

  /** POST / — create custom deck (auth required) */
  app.post(
    '/',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = CreateDeckSchema.parse(request.body);
      const deck = await decksService.createCustomDeck(request.userId, body);
      return reply.status(201).send({ success: true, data: deck });
    },
  );

  /** PUT /:id — update own custom deck (auth required) */
  app.put<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      DeckIdParamSchema.parse(request.params);
      const body = UpdateDeckSchema.parse(request.body);
      const deck = await decksService.updateCustomDeck(
        request.userId,
        request.params.id,
        body,
      );
      return reply.send({ success: true, data: deck });
    },
  );

  /** DELETE /:id — delete own custom deck (auth required) */
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      DeckIdParamSchema.parse(request.params);
      const result = await decksService.deleteCustomDeck(
        request.userId,
        request.params.id,
      );
      return reply.send({ success: true, data: result });
    },
  );

  /** POST /:id/subscribe — adds all deck words to user progress */
  app.post<{ Params: { id: string } }>(
    '/:id/subscribe',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      DeckIdParamSchema.parse(request.params);
      const result = await decksService.subscribeToDeck(
        request.userId,
        request.params.id,
      );
      return reply.status(201).send({ success: true, data: result });
    },
  );

  /** POST /:id/share — generate (or return existing) share code for a custom deck */
  app.post<{ Params: { id: string } }>(
    '/:id/share',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      DeckIdParamSchema.parse(request.params);
      const result = await decksService.shareDeck(request.userId, request.params.id);
      return reply.send({ success: true, data: result });
    },
  );

  /** POST /subscribe-by-code/:code — subscribe to a deck by its share code */
  app.post<{ Params: { code: string } }>(
    '/subscribe-by-code/:code',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { code } = ShareCodeParamSchema.parse(request.params);
      const result = await decksService.subscribeByShareCode(
        request.userId,
        normalizeShareCode(code),
      );
      return reply.status(201).send({ success: true, data: result });
    },
  );
}
