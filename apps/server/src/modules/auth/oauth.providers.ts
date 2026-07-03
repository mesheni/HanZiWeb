import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { loadConfig, getWebPublicUrl } from '../../config.js';
import { getRedis } from '../../lib/redis.js';
import * as oauthService from './oauth.service.js';
import type { OAuthProfile, OAuthProvider } from '@hanzi/shared';

/**
 * OAuth 2.0 authorization-code flow для Google / Yandex и
 * Apple «Sign in with Apple».
 *
 * Архитектура:
 * 1. `GET /api/auth/oauth/:provider` — генерируем случайный `state`,
 *    кладём в Redis на 10 минут (`oauth:state:<state>` →
 *    `{ provider, redirectTo }`), отдаём 302 на authorize-endpoint
 *    провайдера с `state` и `redirect_uri`.
 * 2. `GET /api/auth/oauth/:provider/callback` — провайдер делает
 *    редирект с `?code=&state=`. Проверяем state, обмениваем code
 *    на access_token (POST на token-endpoint), забираем userinfo
 *    (или парсим id_token для Apple), создаём/обновляем User +
 *    UserAccount, выдаём одноразовый код и редиректим клиента на
 *    `<WEB_PUBLIC_URL>/auth/callback?code=&provider=`.
 * 3. Web-клиент: `POST /api/auth/oauth/exchange { code }` →
 *    `AuthResponse` (access + refresh cookie).
 *
 * Всё вручную, без @fastify/passport + @fastify/oauth2 — даёт
 * минимальный набор зависимостей и полный контроль над редиректами.
 *
 * См. PLAN_Features_v0.2 §13.
 */

const STATE_PREFIX = 'oauth:state:';
const STATE_TTL_SEC = 10 * 60; // 10 минут

interface StateRecord {
  provider: OAuthProvider;
  /** Куда вернуть пользователя после обмена (origin web-клиента). */
  redirectOrigin: string;
  /** PKCE code_verifier (Google/Yandex с PKCE). Не используется пока. */
  codeVerifier?: string;
}

function generateStateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

async function saveState(state: string, rec: StateRecord): Promise<void> {
  const redis = getRedis();
  await redis.setex(
    `${STATE_PREFIX}${state}`,
    STATE_TTL_SEC,
    JSON.stringify(rec),
  );
}

async function loadAndConsumeState(state: string): Promise<StateRecord | null> {
  const redis = getRedis();
  const key = `${STATE_PREFIX}${state}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  try {
    return JSON.parse(raw) as StateRecord;
  } catch {
    return null;
  }
}

export interface ProviderSpec {
  provider: OAuthProvider;
  enabled: () => boolean;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string | null;
  scope: string[];
  /** Доп. параметры authorize-endpoint (response_mode, prompt, …). */
  extraAuthorizeParams?: Record<string, string>;
  /** Парсер userinfo → OAuthProfile. */
  parseProfile: (raw: unknown) => OAuthProfile | null;
}

const SPECS: Record<OAuthProvider, ProviderSpec> = {
  google: {
    provider: 'google',
    enabled: () =>
      Boolean(loadConfig().GOOGLE_OAUTH_CLIENT_ID && loadConfig().GOOGLE_OAUTH_CLIENT_SECRET),
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: ['openid', 'email', 'profile'],
    parseProfile: (raw) => {
      const r = raw as Record<string, unknown> | null;
      if (!r) return null;
      const sub = typeof r.sub === 'string' ? r.sub : null;
      if (!sub) return null;
      return {
        provider: 'google',
        providerUserId: sub,
        email: typeof r.email === 'string' ? r.email : undefined,
        emailVerified: r.email_verified === true,
        displayName: typeof r.name === 'string' ? r.name : undefined,
        avatarUrl: typeof r.picture === 'string' ? r.picture : undefined,
      };
    },
  },
  apple: {
    provider: 'apple',
    enabled: () =>
      Boolean(loadConfig().APPLE_OAUTH_CLIENT_ID && loadConfig().APPLE_OAUTH_CLIENT_SECRET),
    authorizationUrl: 'https://appleid.apple.com/auth/authorize',
    tokenUrl: 'https://appleid.apple.com/auth/token',
    userinfoUrl: null,
    scope: ['name', 'email'],
    extraAuthorizeParams: { response_mode: 'form_post' },
    parseProfile: () => null,
  },
  yandex: {
    provider: 'yandex',
    enabled: () =>
      Boolean(loadConfig().YANDEX_OAUTH_CLIENT_ID && loadConfig().YANDEX_OAUTH_CLIENT_SECRET),
    authorizationUrl: 'https://oauth.yandex.ru/authorize',
    tokenUrl: 'https://oauth.yandex.ru/token',
    userinfoUrl: 'https://login.yandex.ru/info?format=json',
    scope: ['login:info', 'login:email'],
    parseProfile: (raw) => {
      const r = raw as Record<string, unknown> | null;
      if (!r) return null;
      const id = typeof r.id === 'string' ? r.id : null;
      if (!id) return null;
      let email: string | undefined;
      if (typeof r.default_email === 'string') email = r.default_email;
      else if (Array.isArray(r.emails)) {
        const arr = r.emails as Array<Record<string, unknown>>;
        const confirmed = arr.find(
          (e) => typeof e.email === 'string' && e.confirmed === true,
        );
        if (confirmed) email = String(confirmed.email);
        else {
          const any = arr.find((e) => typeof e.email === 'string');
          if (any) email = String(any.email);
        }
      }
      const displayName =
        typeof r.display_name === 'string' && r.display_name.length > 0
          ? r.display_name
          : typeof r.real_name === 'string' && r.real_name.length > 0
            ? r.real_name
            : typeof r.login === 'string'
              ? r.login
              : undefined;
      const avatarUrl =
        typeof r.default_avatar_id === 'string'
          ? `https://avatars.yandex.net/get-yapic/${r.default_avatar_id}/islands-200`
          : undefined;
      return {
        provider: 'yandex',
        providerUserId: id,
        email,
        emailVerified: Boolean(email),
        displayName,
        avatarUrl,
      };
    },
  },
};

export function getSpec(p: string): ProviderSpec | null {
  if (p === 'google' || p === 'apple' || p === 'yandex') return SPECS[p];
  return null;
}

function buildAuthorizeUrl(
  spec: ProviderSpec,
  params: { clientId: string; redirectUri: string; state: string },
): string {
  const url = new URL(spec.authorizationUrl);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', spec.scope.join(' '));
  url.searchParams.set('state', params.state);
  for (const [k, v] of Object.entries(spec.extraAuthorizeParams ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

async function exchangeCodeForToken(
  spec: ProviderSpec,
  params: { clientId: string; clientSecret: string; code: string; redirectUri: string },
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
  });
  const res = await fetch(spec.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(
      new Error(`Token exchange failed: ${res.status} ${text.slice(0, 200)}`),
      { statusCode: 502, code: 'OAUTH_TOKEN_EXCHANGE_FAILED' },
    );
  }
  return JSON.parse(text) as TokenResponse;
}

async function fetchUserinfo(url: string, accessToken: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw Object.assign(
      new Error(`userinfo failed: ${res.status}`),
      { statusCode: 502, code: 'OAUTH_USERINFO_FAILED' },
    );
  }
  return res.json();
}

/**
 * Регистрирует все OAuth-маршруты (`/oauth/:provider`,
 * `/oauth/:provider/callback`). Маршрут `/oauth/exchange`
 * регистрируется в основном `authRoutes` отдельно, так как
 * ему нужен доступ к refresh-cookie-опциям.
 */
export async function registerOAuthRoutes(app: FastifyInstance): Promise<void> {
  const cfg = loadConfig();
  const baseUrl = getWebPublicUrl(cfg);
  const baseApi = cfg.CORS_ORIGIN.replace(/\/$/, '');

  const handleStart = async (
    request: import('fastify').FastifyRequest<{ Params: { provider: string } }>,
    reply: import('fastify').FastifyReply,
  ) => {
    const spec = getSpec(request.params.provider);
    if (!spec) {
      return reply.status(404).send({
        success: false,
        error: { code: 'UNKNOWN_PROVIDER', message: 'Unknown OAuth provider' },
      });
    }
    if (!spec.enabled()) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: `OAuth provider "${spec.provider}" is not configured`,
        },
      });
    }
    const state = generateStateToken();
    await saveState(state, {
      provider: spec.provider,
      redirectOrigin: baseUrl,
    });
    const clientId =
      spec.provider === 'google'
        ? cfg.GOOGLE_OAUTH_CLIENT_ID!
        : spec.provider === 'apple'
          ? cfg.APPLE_OAUTH_CLIENT_ID!
          : cfg.YANDEX_OAUTH_CLIENT_ID!;
    const redirectUri = `${baseApi}/api/auth/oauth/${spec.provider}/callback`;
    const authUrl = buildAuthorizeUrl(spec, { clientId, redirectUri, state });
    return reply.redirect(authUrl, 302);
  };

  // GET — для Google/Yandex (response_type=code → query).
  // POST — для Apple, у которого response_mode=form_post
  //        (браузер сам сабмитит форму обратно к нам).
  app.get('/oauth/:provider', handleStart);
  app.post(
    '/oauth/:provider/callback',
    async (
      request: import('fastify').FastifyRequest<{
        Params: { provider: string };
        Body: Record<string, string>;
      }>,
      reply: import('fastify').FastifyReply,
    ) => {
      return runOAuthCallback(request, reply, true);
    },
  );
  app.get(
    '/oauth/:provider/callback',
    async (
      request: import('fastify').FastifyRequest<{
        Params: { provider: string };
        Querystring: { code?: string; state?: string; error?: string };
      }>,
      reply: import('fastify').FastifyReply,
    ) => {
      return runOAuthCallback(request, reply, false);
    },
  );

  async function runOAuthCallback(
    request: import('fastify').FastifyRequest<{
      Params: { provider: string };
    }>,
    reply: import('fastify').FastifyReply,
    isPost: boolean,
  ): Promise<import('fastify').FastifyReply> {
    const spec = getSpec(request.params.provider);
    if (!spec) {
      return reply.status(404).send({
        success: false,
        error: { code: 'UNKNOWN_PROVIDER', message: 'Unknown OAuth provider' },
      });
    }

    // Достаём state/code из GET query или POST body.
    const state = isPost
      ? ((request.body as Record<string, string>).state ?? null)
      : ((request.query as Record<string, string>).state ?? null);
    const code = isPost
      ? ((request.body as Record<string, string>).code ?? null)
      : ((request.query as Record<string, string>).code ?? null);
    const error = isPost
      ? ((request.body as Record<string, string>).error ?? null)
      : ((request.query as Record<string, string>).error ?? null);

    const redirectError = (message: string) =>
      reply.redirect(
        oauthService.buildOAuthRedirectUrl(baseUrl, {
          provider: spec.provider,
          error: message,
        }),
        302,
      );

    if (error) return redirectError(error);
    if (!state) return redirectError('missing_state');
    if (!code) return redirectError('missing_code');

    const saved = await loadAndConsumeState(state);
    if (!saved || saved.provider !== spec.provider) {
      return redirectError('invalid_state');
    }

    const clientId =
      spec.provider === 'google'
        ? cfg.GOOGLE_OAUTH_CLIENT_ID!
        : spec.provider === 'apple'
          ? cfg.APPLE_OAUTH_CLIENT_ID!
          : cfg.YANDEX_OAUTH_CLIENT_ID!;
    const clientSecret =
      spec.provider === 'google'
        ? cfg.GOOGLE_OAUTH_CLIENT_SECRET!
        : spec.provider === 'apple'
          ? cfg.APPLE_OAUTH_CLIENT_SECRET!
          : cfg.YANDEX_OAUTH_CLIENT_SECRET!;
    const redirectUri = `${baseApi}/api/auth/oauth/${spec.provider}/callback`;

    let tokens: TokenResponse;
    try {
      tokens = await exchangeCodeForToken(spec, {
        clientId,
        clientSecret,
        code,
        redirectUri,
      });
    } catch (err) {
      app.log.warn({ err, provider: spec.provider }, 'OAuth token exchange failed');
      return redirectError('token_exchange_failed');
    }
    if (!tokens.access_token) {
      return redirectError('no_access_token');
    }

    let profile: OAuthProfile | null = null;
    if (spec.provider === 'apple') {
      const idToken = tokens.id_token;
      if (!idToken) return redirectError('missing_id_token');
      const parsed = parseAppleIdToken(idToken);
      if (!parsed) return redirectError('invalid_id_token');
      profile = {
        provider: 'apple',
        providerUserId: parsed.sub,
        email: parsed.email,
        emailVerified: Boolean(parsed.email),
        displayName: undefined,
        avatarUrl: undefined,
      };
    } else if (spec.userinfoUrl) {
      try {
        const raw = await fetchUserinfo(spec.userinfoUrl, tokens.access_token);
        profile = spec.parseProfile(raw);
      } catch (err) {
        app.log.warn({ err, provider: spec.provider }, 'OAuth userinfo failed');
        return redirectError('userinfo_failed');
      }
      if (!profile) return redirectError('invalid_profile');
    } else {
      return redirectError('userinfo_not_available');
    }

    let userId: string;
    try {
      userId = await oauthService.findOrCreateOAuthUser(profile);
    } catch (err) {
      app.log.error({ err, provider: spec.provider }, 'findOrCreateOAuthUser failed');
      return redirectError('user_create_failed');
    }

    const exchangeCode = await oauthService.issueExchangeCode(userId);
    return reply.redirect(
      oauthService.buildOAuthRedirectUrl(saved.redirectOrigin, {
        code: exchangeCode,
        provider: spec.provider,
      }),
      302,
    );
  }
}

/**
 * Парсит Apple id_token (JWT) и возвращает минимальный набор полей.
 * JWT здесь НЕ верифицируется подписью (Apple уже отдала токен
 * только после успешного обмена кода на сервере Apple), а лишь
 * разбирается как base64url-encoded JSON.
 */
function parseAppleIdToken(
  idToken: string,
): { sub: string; email?: string } | null {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1];
  if (!payloadB64) return null;
  try {
    const json = Buffer.from(
      payloadB64.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
    const obj = JSON.parse(json) as Record<string, unknown>;
    const sub = typeof obj.sub === 'string' ? obj.sub : null;
    if (!sub) return null;
    return {
      sub,
      email: typeof obj.email === 'string' ? obj.email : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Возвращает список провайдеров с флагом `enabled` (используется
 * в `/auth/oauth/providers`).
 */
export function listProviders(): Array<{ provider: OAuthProvider; enabled: boolean }> {
  return (['google', 'apple', 'yandex'] as const).map((p) => ({
    provider: p,
    enabled: SPECS[p].enabled(),
  }));
}
