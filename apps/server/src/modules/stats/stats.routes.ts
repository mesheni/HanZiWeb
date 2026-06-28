import { FastifyInstance } from 'fastify';
import * as statsService from './stats.service.js';

export async function statsRoutes(app: FastifyInstance) {
  /** GET /stats/overview — общая статистика пользователя */
  app.get('/overview', { preHandler: [app.authenticate] }, async (request, reply) => {
    const stats = await statsService.getOverview(request.userId);
    return reply.send({ success: true, data: stats });
  });

  /** GET /stats/activity?year=2026&month=6 — календарь активности */
  app.get<{ Querystring: { year?: string; month?: string } }>(
    '/activity',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const year = request.query.year ? parseInt(request.query.year, 10) : new Date().getFullYear();
      const month = request.query.month ? parseInt(request.query.month, 10) : new Date().getMonth() + 1;
      const data = await statsService.getActivityData(request.userId, year, month);
      return reply.send({ success: true, data });
    },
  );
}
