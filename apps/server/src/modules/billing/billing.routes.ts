import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import * as billingService from './billing.service.js';

export async function billingRoutes(app: FastifyInstance) {
  app.post('/checkout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId } });
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }
    const result = await billingService.createCheckoutSession(request.userId, user.email);
    return reply.send({ success: true, data: result });
  });

  app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1024 * 1024 }, async function (_req: any, body: Buffer) {
    (_req as any).rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const str = body.toString('utf-8');
    return str ? JSON.parse(str) : {};
  });

  app.post('/webhook', async (request, reply) => {
    const signature = request.headers['stripe-signature'] as string;
    if (!signature) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_SIGNATURE', message: 'Missing stripe-signature header' } });
    }

    const rawBody = (request as any).rawBody as Buffer;
    if (!rawBody) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_BODY', message: 'Missing raw body' } });
    }

    const result = await billingService.handleWebhook(rawBody, signature);
    return reply.send(result);
  });
}
