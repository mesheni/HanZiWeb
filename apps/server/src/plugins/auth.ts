import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../config.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

interface JwtPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  const config = loadConfig();

  fastify.decorateRequest('userId', '');

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing access token' } });
    }

    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
      request.userId = payload.userId;
    } catch {
      return reply.status(401).send({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Access token expired or invalid' } });
    }
  });
}

export default fp(authPlugin, { name: 'auth' });
