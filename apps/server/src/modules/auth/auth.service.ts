import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../../config.js';
import { prisma } from '../../lib/prisma.js';
import type { Register, Login } from '@hanzi/shared';

const SALT_ROUNDS = 12;

interface TokenPayload {
  sub: string;
}

function generateAccessToken(userId: string): string {
  const config = loadConfig();
  return jwt.sign({ sub: userId } satisfies TokenPayload, config.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(userId: string): string {
  const config = loadConfig();
  return jwt.sign({ sub: userId } satisfies TokenPayload, config.JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

export async function registerUser(input: Register) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409, code: 'EMAIL_EXISTS' });
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash },
  });

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

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

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  }

  // Обновляем lastActiveDate
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveDate: new Date() } });

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  return {
    user: { id: user.id, email: user.email, xp: user.xp, currentStreak: user.currentStreak },
    accessToken,
    refreshToken,
  };
}

export async function refreshTokens(token: string) {
  const config = loadConfig();
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as TokenPayload;
  } catch {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401, code: 'INVALID_TOKEN' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 401, code: 'USER_NOT_FOUND' });
  }

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  return {
    user: { id: user.id, email: user.email, xp: user.xp, currentStreak: user.currentStreak },
    accessToken,
    refreshToken,
  };
}
