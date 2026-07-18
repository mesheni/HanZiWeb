import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { getUserStreak } from './stats.service.js';

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

describe('getUserStreak — timezone-aware day bucketing (PLAN_Features_v0.4 §24)', () => {
  beforeAll(async () => {
    utcUserId = await createUser('utc', 'UTC');
    moscowUserId = await createUser('moscow', 'Europe/Moscow');
  });

  afterAll(async () => {
    if (utcUserId) await prisma.user.deleteMany({ where: { id: utcUserId } });
    if (moscowUserId) await prisma.user.deleteMany({ where: { id: moscowUserId } });
  });

  it('первая активность (UTC) → streak=1', async () => {
    await prisma.user.update({
      where: { id: utcUserId },
      data: { currentStreak: 0, lastActiveDate: null },
    });
    const res = await getUserStreak(utcUserId, new Date('2026-07-15T12:00:00.000Z'));
    expect(res.currentStreak).toBe(1);
  });

  it('повторный вызов в тот же UTC-день → streak не меняется, БД не апдейтится', async () => {
    // Уже lastActiveDate = 2026-07-15T00:00:00.000Z (UTC midnight) после предыдущего теста.
    const before = await prisma.user.findUnique({ where: { id: utcUserId } });
    const res = await getUserStreak(utcUserId, new Date('2026-07-15T23:30:00.000Z'));
    expect(res.currentStreak).toBe(1);
    const after = await prisma.user.findUnique({ where: { id: utcUserId } });
    expect(after?.lastActiveDate?.toISOString()).toBe(before?.lastActiveDate?.toISOString());
  });

  it('UTC пользователь: следующий UTC день → streak=2 (consecutive)', async () => {
    // lastActiveDate = 2026-07-15. Сейчас «сегодня» = 2026-07-16 → +1.
    const res = await getUserStreak(utcUserId, new Date('2026-07-16T05:00:00.000Z'));
    expect(res.currentStreak).toBe(2);
  });

  it('Москва: 23:30Z 15 июля в Москве — это уже 16-е, streak с нуля = 1', async () => {
    // Пользователь с tz=Europe/Moscow, никакой предыдущей активности.
    await prisma.user.update({
      where: { id: moscowUserId },
      data: { currentStreak: 0, lastActiveDate: null },
    });
    // В Москве сейчас 2026-07-16T02:30:00. Это «сегодня» = 16-е.
    const res = await getUserStreak(moscowUserId, new Date('2026-07-15T23:30:00.000Z'));
    expect(res.currentStreak).toBe(1);
  });

  it('Москва: 20:59Z 15 июля — ещё 15-е, повторная активность не меняет стрик', async () => {
    // Установим lastActiveDate в 2026-07-15T21:00:00Z (= 00:00 MSK 16-го... нет, неправильно).
    // Правильно: 2026-07-15T21:00:00Z = 2026-07-16T00:00:00 MSK — это 16-е в Москве.
    // Для «15-е в Москве» нужно lastActiveDate = 2026-07-14T21:00:00Z.
    await prisma.user.update({
      where: { id: moscowUserId },
      data: { currentStreak: 5, lastActiveDate: new Date('2026-07-14T21:00:00.000Z') },
    });
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
