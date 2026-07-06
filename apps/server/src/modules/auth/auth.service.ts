import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../../config.js';
import { prisma } from '../../lib/prisma.js';
import { getRedis } from '../../lib/redis.js';
import type {
  Register,
  Login,
  ChangePassword,
  ForgotPassword,
  ResetPassword,
} from '@hanzi/shared';

const SALT_ROUNDS = 12;

/** TTL токена восстановления пароля (15 минут). */
const PASSWORD_RESET_TTL_SEC = 15 * 60;

/** Префикс ключа Redis для токенов сброса пароля. */
const PASSWORD_RESET_PREFIX = 'pwreset:';

interface AccessTokenPayload {
  userId: string;
  email: string;
  /** Снимок `User.passwordVersion` на момент выдачи токена. */
  pv: number;
}

interface RefreshTokenPayload {
  userId: string;
  tokenVersion: number;
}

/** Генерирует короткоживущий JWT (15 минут) для авторизации. */
export function generateAccessToken(userId: string, email: string, pv: number): string {
  const config = loadConfig();
  return jwt.sign(
    { userId, email, pv } satisfies AccessTokenPayload,
    config.JWT_ACCESS_SECRET,
    { expiresIn: '15m' },
  );
}

/** Генерирует долгоживущий refresh-токен (30 дней). */
export function generateRefreshToken(userId: string, tokenVersion: number): string {
  const config = loadConfig();
  return jwt.sign({ userId, tokenVersion } satisfies RefreshTokenPayload, config.JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

export async function registerUser(input: Register) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409, code: 'EMAIL_EXISTS' });
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      emailVerified: true,
      lastActiveDate: new Date(),
    },
  });

  const accessToken = generateAccessToken(user.id, user.email, user.passwordVersion);
  const refreshToken = generateRefreshToken(user.id, 0);

  return {
    user: { id: user.id, email: user.email, xp: user.xp, currentStreak: user.currentStreak },
    accessToken,
    refreshToken,
  };
}

export async function loginUser(input: Login) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  }

  // Пользователь без пароля = зарегистрирован через OAuth.
  if (!user.passwordHash) {
    throw Object.assign(new Error('This account uses social login'), {
      statusCode: 400,
      code: 'PASSWORD_NOT_SET',
    });
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  }

  // Обновляем lastActiveDate
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveDate: new Date() } });

  const accessToken = generateAccessToken(user.id, user.email, user.passwordVersion);
  const refreshToken = generateRefreshToken(user.id, user.tokenVersion);

  return {
    user: { id: user.id, email: user.email, xp: user.xp, currentStreak: user.currentStreak },
    accessToken,
    refreshToken,
  };
}

export async function refreshTokens(token: string) {
  const config = loadConfig();
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401, code: 'INVALID_TOKEN' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 401, code: 'USER_NOT_FOUND' });
  }

  if (payload.tokenVersion !== user.tokenVersion) {
    throw Object.assign(new Error('Token revoked'), { statusCode: 401, code: 'TOKEN_REVOKED' });
  }

  // Rotate: increment tokenVersion to invalidate the old refresh token
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { tokenVersion: { increment: 1 } },
  });

  const accessToken = generateAccessToken(user.id, user.email, user.passwordVersion);
  const refreshToken = generateRefreshToken(user.id, updated.tokenVersion);

  return {
    user: { id: user.id, email: user.email, xp: user.xp, currentStreak: user.currentStreak },
    accessToken,
    refreshToken,
  };
}

export async function logoutUser(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

/**
 * Смена пароля авторизованным пользователем (PLAN_Features_v0.3 §1).
 *
 * Проверяет `currentPassword` через `bcrypt.compare`, валидирует
 * `newPassword` по тем же правилам, что и при регистрации (длина 8–128),
 * хеширует новый пароль и обновляет запись `User`. Дополнительно
 * инкрементит `tokenVersion` (refresh-токены на других устройствах
 * становятся невалидны) и `passwordVersion` (claim `pv` в текущем
 * access-токене становится ниже актуального → следующий запрос
 * вернёт 401 и клиент будет вынужден перелогиниться).
 *
 * @throws Error с `statusCode` и `code`:
 * - `404 USER_NOT_FOUND` — пользователь не найден.
 * - `400 PASSWORD_NOT_SET` — OAuth-only аккаунт, пароля нет.
 * - `401 INVALID_PASSWORD` — `currentPassword` не совпал.
 * - `400 WEAK_PASSWORD` — `newPassword` не прошёл валидацию.
 */
export async function changePassword(
  userId: string,
  input: ChangePassword,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw Object.assign(new Error('User not found'), {
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
  }

  // OAuth-only аккаунт: пароля нет — установить можно только через
  // восстановление (PLAN_Features_v0.3 §2).
  if (!user.passwordHash) {
    throw Object.assign(
      new Error('This account uses social login. Set a password via password recovery.'),
      { statusCode: 400, code: 'PASSWORD_NOT_SET' },
    );
  }

  const currentMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!currentMatches) {
    throw Object.assign(new Error('Current password is incorrect'), {
      statusCode: 401,
      code: 'INVALID_PASSWORD',
    });
  }

  if (input.currentPassword === input.newPassword) {
    throw Object.assign(new Error('New password must be different from the current one'), {
      statusCode: 400,
      code: 'WEAK_PASSWORD',
    });
  }

  const newPasswordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);

  // Инкремент tokenVersion инвалидирует все существующие refresh-токены,
  // инкремент passwordVersion — все access-токены, у которых claim `pv`
  // меньше нового значения.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newPasswordHash,
      tokenVersion: { increment: 1 },
      passwordVersion: { increment: 1 },
    },
  });
}

/**
 * Генерирует криптостойкий одноразовый токен восстановления пароля.
 * 32 байта → 64 hex-символа, URL-safe.
 */
export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Запрос на сброс пароля (PLAN_Features_v0.3 §2, шаг 1).
 *
 * Поведение:
 * 1. Загружает `User` по email.
 *    - Если такого email нет — тихий возврат (`success: true` в роуте),
 *      без утечки информации.
 * 2. Если email зарегистрирован — генерирует токен, кладёт в Redis
 *    с ключом `pwreset:<token>` → `userId` на 15 минут.
 * 3. Отправляет письмо со ссылкой `${WEB_PUBLIC_URL}/reset-password?token=…`.
 *
 * ВАЖНО: токен сохраняется в Redis ДО отправки письма, чтобы:
 * - при ошибке отправки пользователь мог повторно запросить сброс;
 * - письмо не уходило, если Redis недоступен (иначе у пользователя
 *   будет «битая» ссылка).
 *
 * @throws EMAIL_SEND_FAILED — если SMTP не настроен или упала отправка.
 */
export async function requestPasswordReset(input: ForgotPassword): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true },
  });
  if (!user) {
    // Тихий возврат — не раскрываем существование email.
    return;
  }

  const token = generatePasswordResetToken();
  const redis = getRedis();
  await redis.setex(`${PASSWORD_RESET_PREFIX}${token}`, PASSWORD_RESET_TTL_SEC, user.id);

  // Отправка письма. Если SMTP не настроен — бросаем EmailNotConfiguredError,
  // роут вернёт 503, но токен останется валидным (пользователь сможет
  // запросить сброс повторно после настройки).
  const { sendPasswordResetEmail, EmailNotConfiguredError } = await import(
    '../../lib/email.js'
  );
  const { getWebPublicUrl } = await import('../../config.js');
  const baseUrl = getWebPublicUrl();
  const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await sendPasswordResetEmail(user.email, resetLink);
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      throw Object.assign(err, { code: 'EMAIL_NOT_CONFIGURED' });
    }
    // Любая другая ошибка отправки — логируем и пробрасываем
    // как 500, чтобы в логах остался явный след.
    throw Object.assign(new Error('Failed to send password reset email'), {
      statusCode: 500,
      code: 'EMAIL_SEND_FAILED',
      cause: err,
    });
  }
}

/**
 * Подтверждение сброса пароля (PLAN_Features_v0.3 §2, шаг 2).
 *
 * 1. Забирает `userId` из Redis по ключу `pwreset:<token>`. Если токен
 *    не найден / истёк → `400 INVALID_TOKEN`.
 * 2. Хеширует новый пароль, обновляет `User.passwordHash`.
 * 3. Инкрементит `tokenVersion` (refresh-токены на других устройствах
 *    становятся невалидны) и `passwordVersion` (claim `pv` в access-токене
 *    перестаёт совпадать → middleware вернёт 401).
 * 4. Удаляет токен из Redis, чтобы его нельзя было использовать повторно.
 *
 * @throws Error с `statusCode` и `code`:
 * - `400 INVALID_TOKEN` — токен не найден / истёк.
 * - `404 USER_NOT_FOUND` — пользователь был удалён между запросом и сбросом.
 */
export async function resetPassword(input: ResetPassword): Promise<void> {
  const redis = getRedis();
  const key = `${PASSWORD_RESET_PREFIX}${input.token}`;
  const userId = await redis.get(key);
  if (!userId) {
    throw Object.assign(new Error('Invalid or expired reset token'), {
      statusCode: 400,
      code: 'INVALID_TOKEN',
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    // Зачистим «висящий» токен и сообщим — не частая ситуация,
    // но если пользователь удалён между запросом и подтверждением.
    await redis.del(key);
    throw Object.assign(new Error('User not found'), {
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
  }

  const newPasswordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newPasswordHash,
      tokenVersion: { increment: 1 },
      passwordVersion: { increment: 1 },
    },
  });
  // Токен — одноразовый.
  await redis.del(key);
}
