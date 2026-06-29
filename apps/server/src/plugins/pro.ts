import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';

declare module 'fastify' {
  interface FastifyInstance {
    requirePro: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function proPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorate('requirePro', async function (request: FastifyRequest, reply: FastifyReply) {
    const user = await prisma.user.findUnique({ where: { id: request.userId }, select: { subscriptionTier: true, subscriptionExpiresAt: true } });
    if (!user) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
    }
    if (user.subscriptionTier !== 'pro') {
      return reply.status(403).send({ success: false, error: { code: 'PRO_REQUIRED', message: 'This feature requires a Pro subscription' } });
    }
    if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
      return reply.status(403).send({ success: false, error: { code: 'PRO_EXPIRED', message: 'Your Pro subscription has expired' } });
    }
  });
}

export default fp(proPlugin, { name: 'pro' });
