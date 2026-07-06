import crypto from 'node:crypto';
import { getRedis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { generateAccessToken, generateRefreshToken } from './auth.service.js';
import type { OAuthProfile, OAuthProvider } from '@hanzi/shared';

export type { OAuthProfile, OAuthProvider };

/**
 * Ключ Redis для одноразовых кодов обмена (`POST /auth/oauth/exchange`).
 * Хранит `userId` с TTL 60 секунд, чтобы клиент мог безопасно
 * забрать токены после редиректа.
 */
const OAUTH_CODE_PREFIX = 'oauth:code:';
const OAUTH_CODE_TTL_SEC = 60;

/**
 * Генерирует криптостойкий одноразовый код обмена.
 * Используется в `issueExchangeCode` / `redeemExchangeCode`.
 */
export function generateExchangeCode(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Сохраняет `userId` под случайным кодом в Redis на 60 секунд.
 * Возвращает сам код, который уйдёт во фронт через redirect.
 */
export async function issueExchangeCode(userId: string): Promise<string> {
  const code = generateExchangeCode();
  const redis = getRedis();
  await redis.setex(`${OAUTH_CODE_PREFIX}${code}`, OAUTH_CODE_TTL_SEC, userId);
  return code;
}

/**
 * Забирает и удаляет `userId`, привязанный к одноразовому коду.
 * Возвращает `null`, если код не найден / истёк.
 */
export async function redeemExchangeCode(code: string): Promise<string | null> {
  const redis = getRedis();
  const key = `${OAUTH_CODE_PREFIX}${code}`;
  const userId = await redis.get(key);
  if (!userId) return null;
  await redis.del(key);
  return userId;
}

/**
 * Строит URL редиректа после OAuth-flow на web-клиент.
 * Использует `WEB_PUBLIC_URL` (или `CORS_ORIGIN`) как origin
 * и добавляет `?code=…&provider=…` — клиент заберёт код и обменяет
 * на токены через `POST /api/auth/oauth/exchange`.
 */
export function buildOAuthRedirectUrl(
  baseUrl: string,
  params: { provider: OAuthProvider } & ({ code: string; error?: undefined } | { code?: undefined; error: string }),
): string {
  const url = new URL('/auth/callback', baseUrl);
  url.searchParams.set('provider', params.provider);
  if ('error' in params && params.error) {
    url.searchParams.set('error', params.error);
  } else if ('code' in params && params.code) {
    url.searchParams.set('code', params.code);
  }
  return url.toString();
}

/**
 * Чистый helper: вычисляет, может ли пользователь удалить
 * данную привязку провайдера.
 *
 * Защита от «замка»: пользователь обязан иметь хотя бы один
 * способ войти (либо пароль, либо ещё одну привязку).
 */
export function computeCanUnlink(
  accounts: { provider: string }[],
  hasPassword: boolean,
): boolean {
  if (accounts.length > 1) return true;
  if (accounts.length === 1 && hasPassword) return true;
  return false;
}

/**
 * Делает маску из email для `displayName` (если провайдер не вернул имя).
 * `alice@gmail.com` → `alice`.
 */
export function displayNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return null;
  return email.slice(0, at);
}

/**
 * Находит существующего User по providerUserId или создаёт нового.
 * Если у пользователя уже есть аккаунт с тем же `providerEmail`,
 * привязка добавляется к нему (auto-link by email), но только при
 * `emailVerified === true` — это требование Google/Apple для
 * безопасного auto-link.
 *
 * Поведение:
 * 1. Сначала ищем `UserAccount` по (provider, providerUserId) →
 *    если нашли, возвращаем userId.
 * 2. Иначе, если у профиля есть `emailVerified` email — ищем
 *    User по email и привязываем к нему (upsert UserAccount).
 * 3. Иначе создаём нового User с уникальным `email`
 *    (`<provider>+<providerUserId>@oauth.local`), чтобы не
 *    словить конфликт по `email @unique`.
 *
 * Используется в callback-роутах Google / Yandex.
 */
export async function findOrCreateOAuthUser(profile: OAuthProfile): Promise<string> {
  const existing = await prisma.userAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      },
    },
    select: { userId: true },
  });
  if (existing) return existing.userId;

  if (profile.email && profile.emailVerified) {
    const byEmail = await prisma.user.findUnique({
      where: { email: profile.email },
      select: { id: true },
    });
    if (byEmail) {
      await linkOAuthAccount(byEmail.id, profile);
      return byEmail.id;
    }
  }

  // Новый пользователь. Генерируем уникальный placeholder-email,
  // если провайдер не вернул верифицированный email.
  const email =
    profile.email && profile.emailVerified
      ? profile.email
      : `${profile.provider}+${profile.providerUserId}@oauth.local`;

  const displayName = profile.displayName ?? displayNameFromEmail(profile.email) ?? null;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      displayName,
      avatarUrl: profile.avatarUrl ?? null,
      emailVerified: profile.emailVerified,
      lastActiveDate: new Date(),
    },
    select: { id: true },
  });
  await linkOAuthAccount(user.id, profile);
  return user.id;
}

/**
 * Привязывает к существующему User дополнительный OAuth-аккаунт.
 * Используется и в auto-link при регистрации, и в явном
 * `POST /auth/oauth/:provider/link` (для уже залогиненных).
 *
 * Идемпотентно: повторный вызов с теми же (provider, providerUserId)
 * просто обновляет `providerEmail` / `providerMeta`.
 */
export async function linkOAuthAccount(userId: string, profile: OAuthProfile): Promise<void> {
  const providerMeta = JSON.stringify({
    displayName: profile.displayName ?? null,
    avatarUrl: profile.avatarUrl ?? null,
  });
  await prisma.userAccount.upsert({
    where: {
      provider_providerUserId: {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      },
    },
    create: {
      userId,
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      providerEmail: profile.email ?? null,
      providerMeta,
    },
    update: {
      providerEmail: profile.email ?? null,
      providerMeta,
    },
  });
}

/**
 * Отвязывает OAuth-аккаунт. Защита от «замка» реализована
 * в роуте: `DELETE /auth/oauth/:provider` проверяет, что у
 * пользователя остаётся хотя бы один способ входа.
 */
export async function unlinkOAuthAccount(
  userId: string,
  provider: OAuthProvider,
): Promise<void> {
  await prisma.userAccount.deleteMany({
    where: { userId, provider },
  });
}

/**
 * Возвращает список привязанных аккаунтов пользователя +
 * флаг `canUnlink` (см. `computeCanUnlink`).
 */
export async function getUserAccounts(userId: string): Promise<{
  accounts: Array<{
    id: string;
    provider: OAuthProvider;
    providerEmail: string | null;
    createdAt: Date;
  }>;
  canUnlink: boolean;
}> {
  const [rows, user] = await Promise.all([
    prisma.userAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        provider: true,
        providerEmail: true,
        createdAt: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    }),
  ]);

  return {
    accounts: rows.map((r) => ({
      id: r.id,
      provider: r.provider as OAuthProvider,
      providerEmail: r.providerEmail,
      createdAt: r.createdAt,
    })),
    canUnlink: computeCanUnlink(rows, Boolean(user?.passwordHash)),
  };
}

/**
 * Выпускает access + refresh токены для пользователя.
 * Удобная обёртка для OAuth-callback'ов: они же зеркалят
 * поведение `auth.service.loginUser`, но без password-проверки.
 */
export async function issueTokensForUser(userId: string): Promise<{
  user: { id: string; email: string; xp: number; currentStreak: number };
  accessToken: string;
  refreshToken: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      xp: true,
      currentStreak: true,
      tokenVersion: true,
      passwordVersion: true,
    },
  });
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'USER_NOT_FOUND' });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { lastActiveDate: new Date() },
  });
  const accessToken = generateAccessToken(user.id, user.email, user.passwordVersion);
  const refreshToken = generateRefreshToken(user.id, user.tokenVersion);
  return {
    user: { id: user.id, email: user.email, xp: user.xp, currentStreak: user.currentStreak },
    accessToken,
    refreshToken,
  };
}
