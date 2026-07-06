import { FastifyInstance } from 'fastify';
import { FlagEvaluationSchema } from '@hanzi/shared';
import * as featureFlagsService from './featureFlags.service.js';
import { getKnownFlagKeys } from '../../lib/featureFlags/flags.js';

/**
 * Эндпоинты фичевых флагов (PLAN_Features_v0.2 §15).
 *
 *  - `GET /flags`           — снимок всех известных флагов для текущего
 *                             пользователя (анонимные тоже ок).
 *  - `GET /flags/:key`      — оценка одного флага. 404 если флаг с
 *                             таким `key` не зарегистрирован.
 *
 * Auth опциональна: оценка флага не требует пользователя, но если
 * авторизация есть — используется `request.userId` для whitelist/
 * rollout-bucket'а.
 */
export async function featureFlagsRoutes(app: FastifyInstance) {
  app.get(
    '/',
    { preHandler: [app.authenticateOptional] },
    async (request) => {
      const userId = request.userId || undefined;
      return {
        success: true,
        data: featureFlagsService.getAllFlagsForUser(userId),
      };
    },
  );

  app.get<{ Params: { key: string } }>(
    '/:key',
    { preHandler: [app.authenticateOptional] },
    async (request, reply) => {
      const { key } = request.params;
      if (!getKnownFlagKeys().includes(key)) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'FLAG_NOT_FOUND',
            message: `Unknown feature flag: ${key}`,
          },
        });
      }
      const userId = request.userId || undefined;
      const evaluation = featureFlagsService.getFlagForUser(key, userId).evaluation;
      // Проверяем, что схема совпадает (защита от drift'а).
      FlagEvaluationSchema.parse(evaluation);
      return { success: true, data: evaluation };
    },
  );
}
