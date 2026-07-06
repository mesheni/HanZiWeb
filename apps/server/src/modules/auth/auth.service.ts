import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../../config.js';
import { prisma } from '../../lib/prisma.js';
import type { Register, Login, ChangePassword } from '@hanzi/shared';

const SALT_ROUNDS = 12;

interface AccessTokenPayload {
  userId: string;
  email: string;
}

interface RefreshTokenPayload {
  userId: string;
  tokenVersion: number;
}

/** Генерирует короткоживущий JWT (15 минут) для авторизации. */
export function generateAccessToken(userId: string, email: string): string {
  const config = loadConfig();
  return jwt.sign({ userId, email } satisfies AccessTokenPayload, config.JWT_ACCESS_SECRET, { expiresIn: '15m' });
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

  const accessToken = generateAccessToken(user.id, user.email);
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

  const accessToken = generateAccessToken(user.id, user.email);
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

  const accessToken = generateAccessToken(user.id, user.email);
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
 * инкрементит `tokenVersion` — это инвалидирует все ранее выданные
 * refresh-токены, так что открытые сессии на других устройствах
 * будут вынуждены перелогиниться.
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

  // Инкремент tokenVersion инвалидирует все существующие refresh-токены —
  // это тот же приём, что и в `logoutUser`. После смены пароля все
  // активные сессии (кроме текущей, у которой access-токен ещё жив)
  // потребуют повторного входа.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newPasswordHash,
      tokenVersion: { increment: 1 },
    },
  });
}
