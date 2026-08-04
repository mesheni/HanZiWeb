import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { getRedis } from '../../lib/redis.js';
import { resetPassword, PASSWORD_RESET_PREFIX } from './auth.service.js';

// Проверка single-use reset-токена (PLAN_Features_v0.4 §36):
// `GETDEL` забирает и удаляет ключ атомарно, поэтому токен нельзя
// потребить дважды — ни параллельно, ни последовательно.
const testEmail = `reset-singleuse-${Date.now()}@hanzi.local`;
let userId = '';

async function plantToken(token: string): Promise<void> {
  await getRedis().setex(`${PASSWORD_RESET_PREFIX}${token}`, 600, userId);
}

describe('resetPassword token single-use (PLAN_Features_v0.4 §36)', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: testEmail, passwordHash: null },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it('two concurrent calls with the same token — exactly one wins', async () => {
    const token = `singleuse-${Date.now()}`;
    await plantToken(token);

    const call = () => resetPassword({ token, newPassword: 'NewPass123!' });
    const results = await Promise.allSettled([call(), call()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('sequential reuse of the same token is rejected', async () => {
    const token = `sequential-${Date.now()}`;
    await plantToken(token);

    await resetPassword({ token, newPassword: 'NewPass123!' });
    await expect(resetPassword({ token, newPassword: 'NewPass123!' })).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });

  it('unknown token is rejected without touching anything', async () => {
    await expect(
      resetPassword({ token: `never-issued-${Date.now()}`, newPassword: 'NewPass123!' }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });
});
