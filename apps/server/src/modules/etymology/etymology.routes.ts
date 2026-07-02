import { FastifyInstance } from 'fastify';
import * as etymologyService from './etymology.service.js';

export async function etymologyRoutes(app: FastifyInstance) {
  /**
   * GET /words/:id/etymology — карточка этимологии иероглифа.
   *
   * Эндпоинт публичный (без обязательной авторизации), чтобы карточку
   * можно было открывать и в гостевом режиме. Возвращает развёрнутую
   * структуру (`Etymology`): радикал, тип структуры, компоненты,
   * этимологическая справка и мнемоника. Если данных по иероглифу
   * нет — приходит `found: false` и UI показывает заглушку.
   */
  app.get<{ Params: { id: string } }>(
    '/words/:id/etymology',
    { preHandler: [app.authenticateOptional] },
    async (request, reply) => {
      try {
        const data = await etymologyService.getWordEtymology(request.params.id);
        return reply.send({ success: true, data });
      } catch (err) {
        const e = err as { statusCode?: number; code?: string; message?: string };
        if (e.statusCode) {
          return reply.status(e.statusCode).send({
            success: false,
            error: {
              code: e.code ?? 'ERROR',
              message: e.message ?? 'Upstream error',
            },
          });
        }
        throw err;
      }
    },
  );
}
