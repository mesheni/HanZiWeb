import { FastifyInstance } from 'fastify';
import * as achievementsService from './achievements.service.js';

export async function achievementsRoutes(app: FastifyInstance) {
  /**
   * GET /achievements — список разблокированных достижений
   * пользователя (PLAN_Features_v0.2 §8).
   *
   * Возвращает все типы (метаданные) и отметку `unlocked: true|false`,
   * чтобы UI мог сразу отрисовать полный каталог с заблокированными
   * карточками.
   */
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const achievements = await achievementsService.getUserAchievements(request.userId);
    return reply.send({
      success: true,
      data: {
        achievements,
      },
    });
  });
}
