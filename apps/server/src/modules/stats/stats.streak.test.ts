import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { getUserStreak, touchStreak, getDashboard, computeStreak } from './stats.service.js';

const testRunId = Date.now();
let utcUserId = '';
let moscowUserId = '';

async function createUser(suffix: string, timezone: string | null): Promise<string> {
  const u = await prisma.user.create({
    data: {
      email: `streak-${testRunId}-${suffix}@hanzi.local`,
      ...(timezone !== null ? { timezone } : {}),
    },
  });
  return u.id;
}

async function seedStreak(
  userId: string,
  currentStreak: number,
  lastActiveDate: Date | null,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { currentStreak, lastActiveDate },
  });
}

async function readStreak(
  userId: string,
): Promise<{ currentStreak: number; lastActiveDate: Date | null }> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  return { currentStreak: u?.currentStreak ?? 0, lastActiveDate: u?.lastActiveDate ?? null };
}

describe('streak — чтение read-only, персист только по реальной активности (F12)', () => {
  beforeAll(async () => {
    utcUserId = await createUser('utc', 'UTC');
    moscowUserId = await createUser('moscow', 'Europe/Moscow');
  });

  afterAll(async () => {
    if (utcUserId) await prisma.user.deleteMany({ where: { id: utcUserId } });
    if (moscowUserId) await prisma.user.deleteMany({ where: { id: moscowUserId } });
  });

  describe('getUserStreak — timezone-aware day bucketing (PLAN_Features_v0.4 §24)', () => {
    it('первая активность (UTC) → вычисленный streak=1, БД не тронута', async () => {
      await seedStreak(utcUserId, 0, null);
      const res = await getUserStreak(utcUserId, new Date('2026-07-15T12:00:00.000Z'));
      expect(res.currentStreak).toBe(1);
      // F12: чтение не персистит — стрик появляется только от реальной активности.
      const db = await readStreak(utcUserId);
      expect(db.currentStreak).toBe(0);
      expect(db.lastActiveDate).toBeNull();
    });

    it('повторный вызов в тот же UTC-день → streak не меняется, БД не апдейтится', async () => {
      await seedStreak(utcUserId, 1, new Date('2026-07-15T00:00:00.000Z'));
      const before = await readStreak(utcUserId);
      const res = await getUserStreak(utcUserId, new Date('2026-07-15T23:30:00.000Z'));
      expect(res.currentStreak).toBe(1);
      const after = await readStreak(utcUserId);
      expect(after.currentStreak).toBe(before.currentStreak);
      expect(after.lastActiveDate?.toISOString()).toBe(before.lastActiveDate?.toISOString());
    });

    it('UTC пользователь: следующий UTC день → вычисленный streak=2 (consecutive), БД не тронута', async () => {
      // lastActiveDate = 2026-07-15. Сейчас «сегодня» = 2026-07-16 → +1.
      await seedStreak(utcUserId, 1, new Date('2026-07-15T00:00:00.000Z'));
      const res = await getUserStreak(utcUserId, new Date('2026-07-16T05:00:00.000Z'));
      expect(res.currentStreak).toBe(2);
      const db = await readStreak(utcUserId);
      expect(db.currentStreak).toBe(1);
      expect(db.lastActiveDate?.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    });

    it('Москва: 23:30Z 15 июля в Москве — это уже 16-е, streak с нуля = 1', async () => {
      // Пользователь с tz=Europe/Moscow, никакой предыдущей активности.
      await seedStreak(moscowUserId, 0, null);
      // В Москве сейчас 2026-07-16T02:30:00. Это «сегодня» = 16-е.
      const res = await getUserStreak(moscowUserId, new Date('2026-07-15T23:30:00.000Z'));
      expect(res.currentStreak).toBe(1);
    });

    it('Москва: 20:59Z 15 июля — ещё 15-е, повторная активность не меняет стрик', async () => {
      // Установим lastActiveDate в 2026-07-15T21:00:00Z (= 00:00 MSK 16-го... нет, неправильно).
      // Правильно: 2026-07-15T21:00:00Z = 2026-07-16T00:00:00 MSK — это 16-е в Москве.
      // Для «15-е в Москве» нужно lastActiveDate = 2026-07-14T21:00:00Z.
      await seedStreak(moscowUserId, 5, new Date('2026-07-14T21:00:00.000Z'));
      // Сейчас: 2026-07-15T20:59Z = 2026-07-15T23:59 MSK = 15-е в Москве.
      // lastKey=15, todayKey=15 → no change.
      const res = await getUserStreak(moscowUserId, new Date('2026-07-15T20:59:00.000Z'));
      expect(res.currentStreak).toBe(5);
    });

    it('Москва: переход 15→16 июля (локализованно) = consecutive, +1', async () => {
      // lastKey=15 (2026-07-14T21:00:00Z). Сейчас: 2026-07-15T21:00:00Z
      // = 2026-07-16T00:00 MSK = 16-е в Москве.
      // dayDiff = 1 → +1.
      const res = await getUserStreak(moscowUserId, new Date('2026-07-15T21:00:00.000Z'));
      expect(res.currentStreak).toBe(6);
    });

    it('UTC vs Москва: одна и та же UTC-временная метка — разный «локальный день»', async () => {
      // Ключевая регрессия к bug §24: 2026-07-15T23:30Z — это 15-е в UTC
      // и 16-е в Москве. Прежний UTC-багетинг считал оба 15-ми.
      const utcKey = await import('./stats.service.js').then((m) =>
        m.getLocalDayKey(new Date('2026-07-15T23:30:00.000Z'), 'UTC'),
      );
      const mskKey = await import('./stats.service.js').then((m) =>
        m.getLocalDayKey(new Date('2026-07-15T23:30:00.000Z'), 'Europe/Moscow'),
      );
      expect(utcKey).toBe('2026-07-15');
      expect(mskKey).toBe('2026-07-16');
    });
  });

  describe('touchStreak — персистит стрик только по реальной активности (F12)', () => {
    it('consecutive день → пишет currentStreak + lastActiveDate (якорь локальной полуночи)', async () => {
      await seedStreak(utcUserId, 5, new Date('2026-07-14T00:00:00.000Z'));
      const res = await touchStreak(prisma, utcUserId, new Date('2026-07-15T12:00:00.000Z'));
      expect(res.currentStreak).toBe(6);
      expect(res.lastActiveDate?.toISOString()).toBe('2026-07-15T00:00:00.000Z');
      const db = await readStreak(utcUserId);
      expect(db.currentStreak).toBe(6);
      expect(db.lastActiveDate?.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    });

    it('разрыв > 1 дня → стрик сбрасывается на 1', async () => {
      await seedStreak(utcUserId, 10, new Date('2026-07-01T00:00:00.000Z'));
      const res = await touchStreak(prisma, utcUserId, new Date('2026-07-15T12:00:00.000Z'));
      expect(res.currentStreak).toBe(1);
      const db = await readStreak(utcUserId);
      expect(db.currentStreak).toBe(1);
      expect(db.lastActiveDate?.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    });

    it('уже засчитан сегодня → повторное касание не меняет стрик', async () => {
      await seedStreak(utcUserId, 6, new Date('2026-07-15T00:00:00.000Z'));
      const res = await touchStreak(prisma, utcUserId, new Date('2026-07-15T23:30:00.000Z'));
      expect(res.currentStreak).toBe(6);
      const db = await readStreak(utcUserId);
      expect(db.currentStreak).toBe(6);
    });

    it('lastActiveDate в «будущем» → не откатывается назад (монотонная запись)', async () => {
      await seedStreak(utcUserId, 3, new Date('2026-07-20T00:00:00.000Z'));
      const res = await touchStreak(prisma, utcUserId, new Date('2026-07-15T12:00:00.000Z'));
      // computeStreak отдаёт состояние без изменений, updateMany с условием
      // не проходит — якорь не сдвигается назад.
      expect(res.currentStreak).toBe(3);
      const db = await readStreak(utcUserId);
      expect(db.currentStreak).toBe(3);
      expect(db.lastActiveDate?.toISOString()).toBe('2026-07-20T00:00:00.000Z');
    });
  });

  describe('getDashboard — read-only по стрику (F12)', () => {
    it('просмотр дашборда не персистит lastActiveDate/currentStreak', async () => {
      const yesterday = new Date(Date.now() - 86_400_000);
      const expected = computeStreak(2, yesterday, new Date(), 'UTC');
      await seedStreak(utcUserId, 2, yesterday);
      const before = await readStreak(utcUserId);

      const data = await getDashboard(utcUserId);

      expect(data.streak).toBe(expected.currentStreak);
      const after = await readStreak(utcUserId);
      expect(after.currentStreak).toBe(before.currentStreak);
      expect(after.lastActiveDate?.toISOString()).toBe(before.lastActiveDate?.toISOString());
    });
  });
});
