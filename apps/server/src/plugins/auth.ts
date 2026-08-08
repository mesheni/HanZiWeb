import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../config.js';
import { prisma } from '../lib/prisma.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    /** Роль пользователя, загруженная из БД при `authenticate`. */
    userRole: 'USER' | 'ADMIN';
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateOptional: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * Гард для admin-эндпоинтов. Должен идти ВТОРЫМ в `preHandler`
     * после `authenticate` (иначе `request.userRole` будет дефолтным
     * `USER` и любой запрос отклонится).
     */
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

interface JwtPayload {
  userId: string;
  email: string;
  /**
   * Снимок `User.passwordVersion` на момент выдачи токена. После
   * смены/сброса пароля это значение увеличивается на сервере —
   * middleware проверяет, что pv из токена всё ещё актуален.
   * Может отсутствовать в токенах, выпущенных до PLAN_Features_v0.3 §2.
   */
  pv?: number;
  iat: number;
  exp: number;
}

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  const config = loadConfig();

  fastify.decorateRequest('userId', '');
  fastify.decorateRequest('userRole', 'USER');

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply
        .status(401)
        .send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing access token' } });
    }

    const token = authHeader.slice(7);
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
      }) as JwtPayload;
    } catch {
      return reply
        .status(401)
        .send({
          success: false,
          error: { code: 'TOKEN_EXPIRED', message: 'Access token expired or invalid' },
        });
    }
    request.userId = payload.userId;

    // Проверяем `pv` (passwordVersion). После смены/сброса пароля
    // `User.passwordVersion` инкрементируется, и старые access-токены
    // становятся невалидны немедленно (а не через 15 минут — естественный
    // срок жизни access-токена).
    //
    // Если claim `pv` отсутствует — токен выпущен до миграции
    // (PLAN_Features_v0.3 §2). Считаем его pv=0; следующая смена
    // пароля у пользователя бампнет passwordVersion на 1 и инвалидирует
    // такие токены.
    //
    // Заодно подгружаем `role` — нужно для `requireAdmin`. Берём из БД,
    // а не из JWT-claim'а, чтобы изменение роли вступило в силу
    // немедленно (а не после refresh токена). Доп. расход — 1 лишнее
    // поле в SELECT, не новый запрос (PLAN_Features_v0.4 §22).
    const tokenPv = payload.pv ?? 0;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { passwordVersion: true, role: true },
    });
    if (!user) {
      return reply
        .status(401)
        .send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }
    if (user.passwordVersion !== tokenPv) {
      return reply
        .status(401)
        .send({
          success: false,
          error: { code: 'TOKEN_EXPIRED', message: 'Password was changed — please sign in again' },
        });
    }
    request.userRole = user.role;
  });

  fastify.decorate(
    'authenticateOptional',
    async function (request: FastifyRequest, _reply: FastifyReply) {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return;

      const token = authHeader.slice(7);
      let payload: JwtPayload;
      try {
        payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
          algorithms: ['HS256'],
        }) as JwtPayload;
      } catch {
        // token invalid or expired — proceed without userId
        return;
      }

      // F10: revoked-токен НЕ проходит optional-auth. Раньше pv не
      // сверялся вовсе — access-токен, выпущенный до смены пароля,
      // продолжал читать персональные данные (userProgress в словаре,
      // аналитика от имени юзера). Теперь, как и в `authenticate`,
      // несовпадение passwordVersion = аноним (userId остаётся '').
      const tokenPv = payload.pv ?? 0;
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { passwordVersion: true },
      });
      if (!user || user.passwordVersion !== tokenPv) return;
      request.userId = payload.userId;
    },
  );

  fastify.decorate('requireAdmin', async function (request: FastifyRequest, reply: FastifyReply) {
    if (request.userRole !== 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin role required' },
      });
    }
  });
}

export default fp(authPlugin, { name: 'auth' });
