import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { getActivityData } from './stats.service.js';

const testRunId = Date.now();
let utcUserId = '';
let mskUserId = '';
let laUserId = '';
let sharedWordId = '';

async function createUser(suffix: string, timezone: string | null): Promise<string> {
  const u = await prisma.user.create({
    data: {
      email: `heatmap-${testRunId}-${suffix}@hanzi.local`,
      timezone,
    },
  });
  return u.id;
}

async function createSession(userId: string): Promise<string> {
  const s = await prisma.session.create({
    data: { userId, cardsTotal: 1, mode: 'mixed', practiceType: 'flip-card' },
  });
  return s.id;
}

async function createWord(): Promise<string> {
  const w = await prisma.word.create({
    data: {
      character: `热${testRunId}-${Math.random().toString(36).slice(2, 8)}`,
      pinyin: 'rè',
      translation: 'hot',
    },
  });
  return w.id;
}

async function recordAnswerAt(
  sessionId: string,
  wordId: string,
  rating: number,
  answeredAt: Date,
): Promise<void> {
  await prisma.sessionAnswer.create({
    data: { sessionId, wordId, rating, answeredAt },
  });
}

describe('getActivityData — tz-aware heatmap (PLAN_Features_v0.4 §25)', () => {
  beforeAll(async () => {
    utcUserId = await createUser('utc', 'UTC');
    mskUserId = await createUser('msk', 'Europe/Moscow');
    laUserId = await createUser('la', 'America/Los_Angeles');
    sharedWordId = await createWord();
    // Создадим по сессии для каждого юзера, чтобы FK прошёл.
    const utcSession = await createSession(utcUserId);
    const mskSession = await createSession(mskUserId);
    const laSession = await createSession(laUserId);
    // Второй ответ за то же слово требует НОВОЙ сессии: уникальный
    // индекс (sessionId, wordId) допускает один ответ на слово в
    // сессии (fix v0.4 §45 follow-up).
    const utcSession2 = await createSession(utcUserId);
    const mskSession2 = await createSession(mskUserId);
    const laSession2 = await createSession(laUserId);
    // Тот же UTC-момент: 2026-07-15T23:30:00Z
    //   UTC:        2026-07-15
    //   Moscow:     2026-07-16 (02:30 локально)
    //   Los_Angeles:2026-07-15 (16:30 PDT)
    const ts = new Date('2026-07-15T23:30:00.000Z');
    await recordAnswerAt(utcSession, sharedWordId, 3, ts);
    await recordAnswerAt(mskSession, sharedWordId, 3, ts);
    await recordAnswerAt(laSession, sharedWordId, 3, ts);
    // Дополнительный момент в "стык" года: 2025-12-31T21:00:00Z =
    //   UTC:        2025-12-31
    //   Moscow:     2026-01-01 (00:00 MSK)
    //   LA:         2025-12-31 (13:00 PST)
    const tsYearEdge = new Date('2025-12-31T21:00:00.000Z');
    await recordAnswerAt(utcSession2, sharedWordId, 3, tsYearEdge);
    await recordAnswerAt(mskSession2, sharedWordId, 3, tsYearEdge);
    await recordAnswerAt(laSession2, sharedWordId, 3, tsYearEdge);
  });

  afterAll(async () => {
    for (const id of [utcUserId, mskUserId, laUserId]) {
      if (id) await prisma.user.deleteMany({ where: { id } });
    }
    if (sharedWordId) await prisma.word.deleteMany({ where: { id: sharedWordId } });
  });

  it('UTC user: 2026-07-15T23:30Z rolled onto local 2026-07-15 (regression)', async () => {
    const data = await getActivityData(utcUserId, 2026);
    const map = new Map(data.map((d) => [d.date, d.count]));
    expect(map.get('2026-07-15') ?? 0).toBeGreaterThanOrEqual(1);
    expect(map.get('2026-07-16') ?? 0).toBe(0);
  });

  it('Moscow user: 2026-07-15T23:30Z rolled onto local 2026-07-16 (regression for §25)', async () => {
    // До фикса: `a.answeredAt.toISOString().slice(0,10)` давал
    // 2026-07-15 для всех пользователей, и московский юзер видел
    // «23:30 в среду» подсвеченным во вторнике.
    // После фикса: bucket через getLocalDayKey в tz пользователя.
    const data = await getActivityData(mskUserId, 2026);
    const map = new Map(data.map((d) => [d.date, d.count]));
    expect(map.get('2026-07-16') ?? 0).toBe(1);
    expect(map.get('2026-07-15') ?? 0).toBe(0);
  });

  it('LA user: 2026-07-15T23:30Z is local 2026-07-15 (16:30 PDT)', async () => {
    const data = await getActivityData(laUserId, 2026);
    const map = new Map(data.map((d) => [d.date, d.count]));
    expect(map.get('2026-07-15') ?? 0).toBe(1);
    expect(map.get('2026-07-16') ?? 0).toBe(0);
  });

  it('Moscow user: 2025-12-31T21:00Z is local 2026-01-01 (00:00 MSK) — covers year-edge window', async () => {
    // Fetch-окно расширено до [2025-12-31T21:00Z, 2027-01-01T00:00Z)
    // для московского юзера при year=2026. Без расширения этот
    // ответ (UTC 2025-12-31) был бы потерян.
    const data = await getActivityData(mskUserId, 2026);
    const map = new Map(data.map((d) => [d.date, d.count]));
    expect(map.get('2026-01-01') ?? 0).toBe(1);
  });

  it('UTC user: 2025-12-31T21:00Z stays in 2025, not in 2026 (UTC bounds unchanged)', async () => {
    const data = await getActivityData(utcUserId, 2026);
    const map = new Map(data.map((d) => [d.date, d.count]));
    // UTC-юзер: окно = [2026-01-01T00:00Z, 2027-01-01T00:00Z),
    // 2025-12-31T21:00Z не попадает.
    expect(map.get('2026-01-01') ?? 0).toBe(0);
    const data2025 = await getActivityData(utcUserId, 2025);
    const map2025 = new Map(data2025.map((d) => [d.date, d.count]));
    expect(map2025.get('2025-12-31') ?? 0).toBe(1);
  });

  it('user with NULL timezone falls back to UTC bucket (backward-compat)', async () => {
    const nullTzUserId = await createUser('nulltz', null);
    try {
      const session = await createSession(nullTzUserId);
      const ts = new Date('2026-07-15T23:30:00.000Z');
      await recordAnswerAt(session, sharedWordId, 3, ts);
      const data = await getActivityData(nullTzUserId, 2026);
      const map = new Map(data.map((d) => [d.date, d.count]));
      expect(map.get('2026-07-15') ?? 0).toBe(1);
      expect(map.get('2026-07-16') ?? 0).toBe(0);
    } finally {
      await prisma.user.deleteMany({ where: { id: nullTzUserId } });
    }
  });

  it('month-scoped query: Moscow user 2026-07-15T23:30Z appears in July (not under August)', async () => {
    // Локальная дата = 16-е, но в месяц July для москвича попадает.
    const data = await getActivityData(mskUserId, 2026, 7);
    const map = new Map(data.map((d) => [d.date, d.count]));
    expect(map.get('2026-07-16') ?? 0).toBe(1);
  });

  it('returns empty for year with no answers', async () => {
    const freshUserId = await createUser('empty', 'UTC');
    try {
      const data = await getActivityData(freshUserId, 2030);
      expect(data).toEqual([]);
    } finally {
      await prisma.user.deleteMany({ where: { id: freshUserId } });
    }
  });
});
