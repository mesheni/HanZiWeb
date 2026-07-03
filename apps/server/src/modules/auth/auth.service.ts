import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../../config.js';
import { prisma } from '../../lib/prisma.js';
import type { Register, Login } from '@hanzi/shared';

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
