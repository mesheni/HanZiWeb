import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { refreshTokens, generateRefreshToken } from './auth.service.js';

const testRunId = Date.now();
let userId = '';

describe('refreshTokens — CAS fix (PLAN_Features_v0.4 §21)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({
      data: {
        email: `cas-${testRunId}@hanzi.local`,
        tokenVersion: 7,
      },
    });
    userId = u.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('sequential second refresh with the same token fails with REFRESH_TOKEN_REUSE', async () => {
    // Первый refresh проходит и инкрементит tokenVersion 7 → 8.
    const first = await refreshTokens(generateRefreshToken(userId, 7));
    expect(first.refreshToken).toBeTruthy();

    // Второй refresh с ТЕМ ЖЕ токеном (tokenVersion=7) теперь не пройдёт:
    // CAS находит `tokenVersion: 7` только у строк со старой версией.
    // После первого refresh в БД уже 8 → count=0 → 401.
    let caught: { statusCode?: number; code?: string } | null = null;
    try {
      await refreshTokens(generateRefreshToken(userId, 7));
    } catch (e) {
      caught = e as { statusCode?: number; code?: string };
    }
    expect(caught).not.toBeNull();
    expect(caught?.statusCode).toBe(401);
    expect(caught?.code).toBe('REFRESH_TOKEN_REUSE');
  });

  it('rejects refresh for non-existent user (INVALID_TOKEN or REFRESH_TOKEN_REUSE, both 401)', async () => {
    // Без существующего пользователя `updateMany` найдёт 0 строк по
    // (id, tokenVersion) → 401 REFRESH_TOKEN_REUSE. Подойдёт любой
    // 401 — главное что токен не «утекает».
    let caught: { statusCode?: number } | null = null;
    try {
      await refreshTokens(generateRefreshToken('00000000-0000-0000-0000-000000000000', 0));
    } catch (e) {
      caught = e as { statusCode?: number };
    }
    expect(caught?.statusCode).toBe(401);
  });

  it('after legitimate refresh, new token with new tokenVersion works', async () => {
    // Восстанавливаем tokenVersion=8 (текущее значение из предыдущего
    // теста) и проверяем, что новая пара токенов валидна.
    const current = await prisma.user.findUnique({ where: { id: userId } });
    const version = current!.tokenVersion;
    const token = generateRefreshToken(userId, version);

    const result = await refreshTokens(token);
    expect(result.refreshToken).toBeTruthy();
    // Свежий refreshToken имеет tokenVersion = (version + 1).
    // Расшифровываем обратно и проверяем:
    const { default: jwt } = await import('jsonwebtoken');
    const decoded = jwt.decode(result.refreshToken) as { tokenVersion: number } | null;
    expect(decoded?.tokenVersion).toBe(version + 1);
  });

  it('parallel refresh of the same token: only one wins (CAS atomicity)', async () => {
    // Это собственно уязвимость, которую фикс закрывает: два
    // ПАРАЛЛЕЛЬНЫХ запроса с одним украденным токеном должны дать
    // ровно одну успешную ротацию, второй — 401.
    const current = await prisma.user.findUnique({ where: { id: userId } });
    const startVersion = current!.tokenVersion;
    const sharedToken = generateRefreshToken(userId, startVersion);

    const results = await Promise.allSettled([
      refreshTokens(sharedToken),
      refreshTokens(sharedToken),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Ровно один успех, ровно одно 401.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason as {
      statusCode: number;
      code: string;
    };
    expect(reason.statusCode).toBe(401);
    expect(reason.code).toBe('REFRESH_TOKEN_REUSE');

    // tokenVersion в БД инкрементнут ровно один раз.
    const after = await prisma.user.findUnique({ where: { id: userId } });
    expect(after!.tokenVersion).toBe(startVersion + 1);
  });
});
