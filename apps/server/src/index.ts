import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfig } from './config.js';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { wordsRoutes } from './modules/words/words.routes.js';
import { sessionsRoutes } from './modules/sessions/sessions.routes.js';
import { statsRoutes } from './modules/stats/stats.routes.js';
import { getRedis, closeRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';

async function main() {
  const config = loadConfig();
  const app = Fastify({ logger: true });

  // Plugins
  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(authPlugin);

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Route modules
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(wordsRoutes, { prefix: '/api/words' });
  await app.register(sessionsRoutes, { prefix: '/api/sessions' });
  await app.register(statsRoutes, { prefix: '/api/stats' });

  // Graceful shutdown
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

  // Start Redis
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
