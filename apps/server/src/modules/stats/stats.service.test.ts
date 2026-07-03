import { describe, it, expect } from 'vitest';
import {
  RATING_XP,
  aggregateWeeklyXp,
  computeRank,
  getCurrentWeekWindow,
  maskEmail,
} from './stats.service.js';

describe('RATING_XP', () => {
  it('matches sessions.service.recordAnswer mapping', () => {
    expect(RATING_XP[1]).toBe(0);
    expect(RATING_XP[2]).toBe(1);
    expect(RATING_XP[3]).toBe(3);
    expect(RATING_XP[4]).toBe(5);
  });
});

describe('maskEmail', () => {
  it('masks local part to first 2 chars + ***@domain', () => {
    expect(maskEmail('alice@gmail.com')).toBe('al***@gmail.com');
    expect(maskEmail('verylongname@example.org')).toBe('ve***@example.org');
  });

  it('handles very short local parts', () => {
    expect(maskEmail('a@x.io')).toBe('a***@x.io');
  });

  it('falls back to *** for malformed emails', () => {
    expect(maskEmail('')).toBe('***');
    expect(maskEmail('no-at-sign')).toBe('***');
    expect(maskEmail('@nouser.com')).toBe('***');
    expect(maskEmail('nouser@')).toBe('***');
  });
});

describe('getCurrentWeekWindow', () => {
  it('returns Mon 00:00:00 UTC as start and next Mon as exclusive end', () => {
    // 2026-07-08 — это среда (Wed). Начало недели — Пн 2026-07-06.
    const wed = new Date('2026-07-08T15:30:00.000Z');
    const { start, end } = getCurrentWeekWindow(wed);

    expect(start.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('handles Monday itself (no shift)', () => {
    const mon = new Date('2026-07-06T05:00:00.000Z');
    const { start, end } = getCurrentWeekWindow(mon);
    expect(start.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('handles Sunday (shift back 6 days)', () => {
    const sun = new Date('2026-07-12T20:00:00.000Z');
    const { start, end } = getCurrentWeekWindow(sun);
    expect(start.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('window is exactly 7 days', () => {
    const wed = new Date('2026-07-08T15:30:00.000Z');
    const { start, end } = getCurrentWeekWindow(wed);
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('crosses month boundary correctly', () => {
    // 2026-08-03 — это Пн.
    const mon = new Date('2026-08-03T08:00:00.000Z');
    const { start, end } = getCurrentWeekWindow(mon);
    expect(start.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });
});

describe('aggregateWeeklyXp', () => {
  it('sums XP per userId from rating events', () => {
    const answers = [
      { rating: 3, userId: 'u1' }, // +3
      { rating: 4, userId: 'u1' }, // +5
      { rating: 2, userId: 'u2' }, // +1
      { rating: 1, userId: 'u2' }, // +0
      { rating: 4, userId: 'u3' }, // +5
    ];
    const out = aggregateWeeklyXp(answers);
    expect(out.get('u1')).toBe(8);
    expect(out.get('u2')).toBe(1);
    expect(out.get('u3')).toBe(5);
  });

  it('skips unknown rating values', () => {
    const out = aggregateWeeklyXp([
      { rating: 5, userId: 'u1' },
      { rating: 0, userId: 'u1' },
      { rating: -1, userId: 'u2' },
    ]);
    expect(out.size).toBe(0);
  });

  it('returns empty map for empty input', () => {
    expect(aggregateWeeklyXp([]).size).toBe(0);
  });

  it('handles rating=1 (Again → 0 XP) as no-op', () => {
    const out = aggregateWeeklyXp([{ rating: 1, userId: 'u1' }]);
    expect(out.has('u1')).toBe(false);
  });
});

describe('computeRank', () => {
  it('returns 1 when no one has more XP', () => {
    const map = new Map([
      ['a', 100],
      ['b', 50],
    ]);
    expect(computeRank(200, map)).toBe(1);
  });

  it('counts everyone with strictly greater XP', () => {
    const map = new Map([
      ['a', 300],
      ['b', 200],
      ['c', 100],
    ]);
    // Лучше нас — a (300) и b (200) → rank = 3.
    expect(computeRank(150, map)).toBe(3);
  });

  it('treats equal XP as not-better (position after all greater)', () => {
    const map = new Map([
      ['a', 200],
      ['b', 200],
      ['c', 100],
    ]);
    // Текущий с 200 XP: «лучше» только те, у кого > 200; таких 0 → rank 1.
    expect(computeRank(200, map)).toBe(1);
  });

  it('returns total+1 when no one is better', () => {
    const map = new Map([
      ['a', 100],
      ['b', 50],
    ]);
    expect(computeRank(0, map)).toBe(3);
  });
});
