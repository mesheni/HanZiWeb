import { FastifyInstance } from 'fastify';
import { LeaderboardQuerySchema } from '@hanzi/shared';
import * as statsService from './stats.service.js';

export async function statsRoutes(app: FastifyInstance) {
  /** GET /stats/overview — общая статистика пользователя */
  app.get('/overview', { preHandler: [app.authenticate] }, async (request, reply) => {
    const stats = await statsService.getOverview(request.userId);
    return reply.send({ success: true, data: stats });
  });

  /** GET /stats/dashboard — данные для главного дашборда */
  app.get('/dashboard', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = await statsService.getDashboard(request.userId);
    return reply.send({ success: true, data });
  });

  /** GET /stats/activity?year=2026 — календарь активности (год) */
  app.get<{ Querystring: { year?: string; month?: string } }>(
    '/activity',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const year = request.query.year ? parseInt(request.query.year, 10) : new Date().getFullYear();
      const month = request.query.month ? parseInt(request.query.month, 10) : undefined;
      const data = await statsService.getActivityData(request.userId, year, month);
      return reply.send({ success: true, data });
    },
  );

  /** GET /stats/streak — вычисление и обновление daily streak */
  app.get('/streak', { preHandler: [app.authenticate] }, async (request, reply) => {
    const streak = await statsService.getUserStreak(request.userId);
    return reply.send({ success: true, data: streak });
  });

  /**
   * GET /stats/leaderboard?period=week|all&limit=100
   * Топ пользователей по XP/стрику.
   * См. PLAN_Features_v0.2 §7.
   */
  app.get<{ Querystring: { period?: string; limit?: string } }>(
    '/leaderboard',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = LeaderboardQuerySchema.parse(request.query);
      const data = await statsService.getLeaderboard(
        request.userId,
        query.period,
        query.limit,
      );
      return reply.send({ success: true, data });
    },
  );

  /** POST /stats/reset-progress — полный сброс прогресса */
  app.post('/reset-progress', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await statsService.resetProgress(request.userId);
    return reply.send({ success: true, data: result });
  });
}
