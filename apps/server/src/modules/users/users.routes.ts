import { FastifyInstance } from 'fastify';
import { UpdateUserSettingsSchema } from '@hanzi/shared';
import * as usersService from './users.service.js';

/**
 * Эндпоинты пользовательских настроек.
 * См. PLAN_Features_v0.2 §9 (Ежедневная цель).
 */
export async function usersRoutes(app: FastifyInstance) {
  /** GET /users/settings — текущие пользовательские настройки. */
  app.get('/settings', { preHandler: [app.authenticate] }, async (request, reply) => {
    const settings = await usersService.getUserSettings(request.userId);
    return reply.send({ success: true, data: settings });
  });

  /** PUT /users/settings — обновление пользовательских настроек. */
  app.put('/settings', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = UpdateUserSettingsSchema.parse(request.body);
    const settings = await usersService.updateUserSettings(request.userId, body);
    return reply.send({ success: true, data: settings });
  });
}
