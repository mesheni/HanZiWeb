import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  LoginSchema,
  OAuthExchangeSchema,
  OAuthProviderSchema,
  RegisterSchema,
} from '@hanzi/shared';
import * as authService from './auth.service.js';
import * as oauthService from './oauth.service.js';
import { listProviders, registerOAuthRoutes } from './oauth.providers.js';

export async function authRoutes(app: FastifyInstance) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const, // 'lax' нужен для редиректа после OAuth
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  };

  /** POST /auth/register — создание аккаунта */
  app.post('/register', async (request, reply) => {
    const body = RegisterSchema.parse(request.body);
    const result = await authService.registerUser(body);
    return reply.status(201).send({ success: true, data: result });
  });

  /** POST /auth/login — вход */
  app.post('/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const result = await authService.loginUser(body);
    // Set refresh token as httpOnly cookie
    reply.setCookie('refreshToken', result.refreshToken, cookieOptions);
    return reply.send({
      success: true,
      data: { user: result.user, accessToken: result.accessToken, expiresIn: 900 },
    });
  });

  /** POST /auth/refresh — обновление токенов */
  app.post('/refresh', async (request, reply) => {
    // Accept the refresh token from either the HttpOnly cookie (web)
    // or the request body / Authorization header (mobile clients
    // running through `@hanzi/mobile-sdk` can't rely on cookies).
    const body = request.body as { refreshToken?: string } | undefined;
    const authHeader = request.headers.authorization;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    const refreshToken =
      request.cookies.refreshToken ?? body?.refreshToken ?? bearer;
    if (!refreshToken) {
      return reply.status(401).send({
        success: false,
        error: { code: 'NO_TOKEN', message: 'Refresh token missing' },
      });
    }
    const result = await authService.refreshTokens(refreshToken);
    // Always rotate the HttpOnly cookie for web clients; mobile
    // clients read the new refresh token from the response body.
    reply.setCookie('refreshToken', result.refreshToken, cookieOptions);
    return reply.send({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: 900,
      },
    });
  });

  /** POST /auth/logout — выход */
  app.post('/logout', async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (refreshToken) {
      try {
        const decoded = jwt.decode(refreshToken) as { userId: string } | null;
        if (decoded?.userId) {
          await authService.logoutUser(decoded.userId);
        }
      } catch {
        // Token decode failed — proceed to clear cookie
      }
    }
    reply.clearCookie('refreshToken', { path: '/api/auth' });
    return reply.send({ success: true });
  });

  // ════════════════════════════════════════════════════════════════
  // OAuth (Google / Apple / Yandex) — см. PLAN_Features_v0.2 §13
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /auth/oauth/providers — статус настройки провайдеров
   * (нужен web-клиенту, чтобы показывать/скрывать кнопки).
   */
  app.get('/oauth/providers', async (_request, reply) => {
    return reply.send({
      success: true,
      data: { providers: listProviders() },
    });
  });

  /**
   * POST /auth/oauth/exchange — обмен одноразового кода на токены.
   * Защита от CSRF/утечки: код живёт 60 секунд в Redis и может
   * быть использован только один раз.
   */
  app.post('/oauth/exchange', async (request, reply) => {
    const body = OAuthExchangeSchema.parse(request.body);
    const userId = await oauthService.redeemExchangeCode(body.code);
    if (!userId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_CODE',
          message: 'OAuth exchange code is invalid or expired',
        },
      });
    }
    const result = await oauthService.issueTokensForUser(userId);
    reply.setCookie('refreshToken', result.refreshToken, cookieOptions);
    return reply.send({
      success: true,
      data: { user: result.user, accessToken: result.accessToken, expiresIn: 900 },
    });
  });

  /**
   * GET /auth/accounts — список привязанных OAuth-аккаунтов
   * текущего пользователя + флаг `canUnlink`.
   */
  app.get('/accounts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = await oauthService.getUserAccounts(request.userId);
    return reply.send({
      success: true,
      data: {
        accounts: data.accounts.map((a) => ({
          id: a.id,
          provider: a.provider,
          providerEmail: a.providerEmail,
          createdAt: a.createdAt.toISOString(),
        })),
        canUnlink: data.canUnlink,
      },
    });
  });

  /**
   * DELETE /auth/accounts/:provider — отвязать OAuth-аккаунт.
   * Нельзя удалить единственный способ входа.
   */
  app.delete<{ Params: { provider: string } }>(
    '/accounts/:provider',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest<{ Params: { provider: string } }>, reply: FastifyReply) => {
      const parsed = OAuthProviderSchema.safeParse(request.params.provider);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'UNKNOWN_PROVIDER', message: 'Unknown OAuth provider' },
        });
      }
      const data = await oauthService.getUserAccounts(request.userId);
      if (!data.canUnlink) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'CANNOT_UNLINK',
            message: 'Невозможно удалить единственный способ входа',
          },
        });
      }
      // Убеждаемся, что удаляемый аккаунт вообще привязан
      const hasProvider = data.accounts.some((a) => a.provider === parsed.data);
      if (!hasProvider) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Account is not linked' },
        });
      }
      await oauthService.unlinkOAuthAccount(request.userId, parsed.data);
      return reply.send({ success: true });
    },
  );

  // /auth/oauth/:provider и /auth/oauth/:provider/callback —
  // редиректы на провайдера и обработчики callback'ов. Регистрируются
  // отдельной функцией, чтобы код callback'а был читаемым.
  // GET /auth/oauth/exchange — нет; exchange идёт через POST.
  await registerOAuthRoutes(app);
}
