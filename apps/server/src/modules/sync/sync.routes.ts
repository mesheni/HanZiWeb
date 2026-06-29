import type { FastifyInstance } from 'fastify';
import { SyncRequestSchema } from '@hanzi/shared';
import * as syncService from './sync.service.js';

export async function syncRoutes(app: FastifyInstance) {
  app.post('/sync', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = SyncRequestSchema.parse(request.body);
    const result = await syncService.processSync(request.userId, body);
    return reply.send({ success: true, data: result });
  });
}
