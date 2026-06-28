import { FastifyInstance } from 'fastify';
import * as decksService from './decks.service.js';

export async function decksRoutes(app: FastifyInstance) {
  /** GET / — list all decks with word counts */
  app.get('/', async (_request, reply) => {
    const decks = await decksService.listDecks();
    return reply.send({ success: true, data: decks });
  });

  /** GET /:id — deck details with word list */
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const deck = await decksService.getDeck(request.params.id);
    if (!deck) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Deck not found' },
      });
    }
    return reply.send({ success: true, data: deck });
  });

  /** POST /:id/subscribe — authenticated, adds all deck words to user progress */
  app.post<{ Params: { id: string } }>(
    '/:id/subscribe',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await decksService.subscribeToDeck(
        request.userId,
        request.params.id,
      );
      return reply.status(201).send({ success: true, data: result });
    },
  );
}
