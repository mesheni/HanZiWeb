import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { findOrCreateOAuthUser } from './oauth.service.js';

// By-email ветка auto-link (PLAN_Features_v0.4 §37): вход через OAuth
// должен бампать lastActiveDate, иначе streak-расчёт от прошлого
// входа зафиксирует фантомный разрыв.
const testEmail = `oauth-link-${Date.now()}@hanzi.local`;
let userId = '';

describe('findOrCreateOAuthUser by-email branch (PLAN_Features_v0.4 §37)', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: null,
        // «Старый» вход: вчера.
        lastActiveDate: new Date(Date.now() - 86_400_000),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.userAccount.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it('auto-links by email and bumps lastActiveDate', async () => {
    const providerUserId = `g-${Date.now()}`;
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { lastActiveDate: true },
    });
    const beforeMs = before.lastActiveDate?.getTime() ?? 0;
    expect(beforeMs).toBeGreaterThan(0); // юзер создан с «вчерашним» lastActiveDate

    const foundId = await findOrCreateOAuthUser({
      provider: 'google',
      providerUserId,
      email: testEmail,
      emailVerified: true,
    });

    expect(foundId).toBe(userId);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { lastActiveDate: true },
    });
    expect(after.lastActiveDate?.getTime() ?? 0).toBeGreaterThan(beforeMs);

    const account = await prisma.userAccount.findUnique({
      where: {
        provider_providerUserId: { provider: 'google', providerUserId },
      },
    });
    expect(account).not.toBeNull();
  });
});
