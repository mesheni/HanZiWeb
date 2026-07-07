import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  ChangePasswordSchema,
  ForgotPasswordSchema,
  LoginSchema,
  OAuthExchangeSchema,
  OAuthProviderSchema,
  RegisterSchema,
  ResetPasswordSchema,
} from '@hanzi/shared';
import * as authService from './auth.service.js';
import * as oauthService from './oauth.service.js';
import { listProviders, registerOAuthRoutes } from './oauth.providers.js';

export async function authRoutes(app: FastifyInstance) {
  // Cookie maxAge привязан к TTL refresh-токена, чтобы cookie не «отваливалась»
  // раньше, чем сам токен (и наоборот). PLAN_Features_v0.3 §15.
  const refreshExpirySec = authService.getRefreshTokenExpiresInSec();
  const accessExpirySec = authService.getAccessTokenExpiresInSec();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const, // 'lax' нужен для редиректа после OAuth
    path: '/api/auth',
    maxAge: refreshExpirySec,
  };

  /** POST /auth/register — создание аккаунта */
  app.post('/register', async (request, reply) => {
    const body = RegisterSchema.parse(request.body);
    const result = await authService.registerUser(body);
    return reply.status(201).send({ success: true, data: result });
  });

  /**
   * POST /auth/login — вход.
   *
   * Rate limit per-email (PLAN_Features_v0.3 §15) делается в
   * `authService.loginUser` через Redis: ключ `login-attempts:<email>`,
   * лимит `LOGIN_RATE_LIMIT_MAX` за `LOGIN_RATE_LIMIT_WINDOW_SEC` сек.
   * Сбрасывается при успешной аутентификации.
   */
  app.post('/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const result = await authService.loginUser(body);
    // Set refresh token as httpOnly cookie
    reply.setCookie('refreshToken', result.refreshToken, cookieOptions);
    return reply.send({
      success: true,
      data: { user: result.user, accessToken: result.accessToken, expiresIn: accessExpirySec },
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
        expiresIn: accessExpirySec,
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

  /**
   * PUT /auth/change-password — смена пароля авторизованным
   * пользователем (PLAN_Features_v0.3 §1).
   *
   * - 400 `PASSWORD_NOT_SET` — OAuth-only аккаунт.
   * - 400 `WEAK_PASSWORD` — `newPassword` совпадает с текущим или
   *   не прошёл валидацию (длина 8–128).
   * - 401 `INVALID_PASSWORD` — `currentPassword` не совпал.
   * - 401 `UNAUTHORIZED` / `TOKEN_EXPIRED` — нет валидного access-токена.
   *
   * После успешной смены инвалидируются все refresh-токены пользователя
   * (`tokenVersion++`). Текущая сессия сохраняется до окончания
   * access-токена; остальные устройства будут вынуждены перелогиниться.
   */
  app.put(
    '/change-password',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = ChangePasswordSchema.parse(request.body);
      await authService.changePassword(request.userId, body);
      return reply.send({ success: true });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // Password recovery (PLAN_Features_v0.3 §2)
  // ════════════════════════════════════════════════════════════════

  /**
   * POST /auth/forgot-password — запрос ссылки на сброс пароля.
   *
   * Публичный эндпоинт с собственным лимитом 3 запроса / 15 минут / IP —
   * защита от enumeration-атак (иначе злоумышленник мог бы узнать,
   * какие email зарегистрированы, по разнице ответов).
   *
   * Ответ всегда одинаковый: `{ success: true }` (даже если такого
   * email нет). Реальное состояние — 503 `EMAIL_NOT_CONFIGURED` (SMTP
   * не настроен) и 500 `EMAIL_SEND_FAILED` (SMTP упал).
   */
  app.post(
    '/forgot-password',
    {
      config: {
        rateLimit: { max: 3, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const body = ForgotPasswordSchema.parse(request.body);
      await authService.requestPasswordReset(body);
      return reply.send({ success: true });
    },
  );

  /**
   * POST /auth/reset-password — подтверждение сброса по токену из письма.
   *
   * Публичный эндпоинт с лимитом 5 запросов / 15 минут / IP — защита
   * от брутфорса токена.
   *
   * - 400 `INVALID_TOKEN` — токен не найден или истёк (15 минут).
   * - 400 `VALIDATION_ERROR` — невалидный `newPassword` (длина 8–128).
   */
  app.post(
    '/reset-password',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const body = ResetPasswordSchema.parse(request.body);
      await authService.resetPassword(body);
      return reply.send({ success: true });
    },
  );

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
      data: { user: result.user, accessToken: result.accessToken, expiresIn: accessExpirySec },
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
