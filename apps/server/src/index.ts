import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { loadConfig } from './config.js';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { wordsRoutes } from './modules/words/words.routes.js';
import { sessionsRoutes } from './modules/sessions/sessions.routes.js';
import { statsRoutes } from './modules/stats/stats.routes.js';
import { decksRoutes } from './modules/decks/decks.routes.js';
import { audioRoutes } from './modules/audio/audio.routes.js';
import { syncRoutes } from './modules/sync/sync.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import proPlugin from './plugins/pro.js';
import { getRedis, closeRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';

async function main() {
  const config = loadConfig();

  const app = Fastify({
    logger: process.env.NODE_ENV !== 'production'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : true,
  });

  // Plugins
  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(authPlugin);
  await app.register(proPlugin);

  // Initialize Redis (lazy-connect — used by rate limit, health check)
  const redis = getRedis();

  // ── Auth scope: 5 requests/minute/IP ──────────────────────────────
  await app.register(async (child) => {
    await child.register(rateLimit, {
      max: 20,
      timeWindow: '1 minute',
      redis,
      keyGenerator: (req) => req.ip,
      errorResponseBuilder: (_req, ctx) => ({
        statusCode: 429,
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
        },
      }),
    });
    await child.register(authRoutes);
  }, { prefix: '/api/auth' });

  // ── General API scope: 60 requests/minute/IP ──────────────────────
  await app.register(async (child) => {
    await child.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      redis,
      keyGenerator: (req) => req.ip,
      errorResponseBuilder: (_req, ctx) => ({
        statusCode: 429,
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
        },
      }),
    });

    // Health check — actually pings DB and Redis
    child.get('/health', async () => {
      let dbStatus: 'connected' | 'disconnected' = 'disconnected';
      let redisStatus: 'connected' | 'disconnected' = 'disconnected';

      try {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'connected';
      } catch {
        // DB unreachable
      }

      try {
        if (redis) {
          await redis.ping();
          redisStatus = 'connected';
        }
      } catch {
        // Redis unreachable
      }

      const allOk = dbStatus === 'connected' && redisStatus === 'connected';
      return {
        status: allOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        db: dbStatus,
        redis: redisStatus,
      };
    });

    await child.register(wordsRoutes, { prefix: '/words' });
    await child.register(sessionsRoutes, { prefix: '/sessions' });
    await child.register(statsRoutes, { prefix: '/stats' });
    await child.register(decksRoutes, { prefix: '/decks' });
    await child.register(audioRoutes, { prefix: '/audio' });
    await child.register(syncRoutes, { prefix: '/sync' });
    await child.register(billingRoutes, { prefix: '/billing' });
  }, { prefix: '/api' });

  // ── Global error handler ──────────────────────────────────────────
  app.setErrorHandler(async (error, _request, reply) => {
    // Zod validation errors → 400
    if (error instanceof ZodError) {
      const message = error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message },
      });
    }

    // Prisma known-request errors
    const err = error as Record<string, unknown>;
    if (typeof err.code === 'string') {
      if (err.code === 'P2025') {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Resource not found' },
        });
      }
      if (err.code === 'P2002') {
        return reply.status(409).send({
          success: false,
          error: { code: 'CONFLICT', message: 'Resource already exists' },
        });
      }
      if (err.code === 'RATE_LIMIT_EXCEEDED') {
        return reply.status(429).send({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: String(err.message ?? 'Too many requests'),
          },
        });
      }
    }

    // Preserve explicit statusCode (e.g. thrown by plugins)
    if (typeof err.statusCode === 'number' && err.statusCode >= 400) {
      return reply.status(err.statusCode).send({
        success: false,
        error: {
          code: String(err.code ?? 'ERROR'),
          message: String(err.message ?? 'Request error'),
        },
      });
    }

    // Default: 500
    app.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`);
      await app.close();
      await prisma.$disconnect();
      await closeRedis();
      process.exit(0);
    });
  }

  // ── Start ─────────────────────────────────────────────────────────
  try {
    getRedis();
  } catch {
    app.log.warn('Redis not available — caching and rate limiting may be degraded');
  }

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Server running on http://localhost:${config.PORT}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
