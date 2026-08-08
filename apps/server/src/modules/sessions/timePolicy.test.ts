import { describe, it, expect } from 'vitest';
import { sanitizeClientTimestamp, computeElapsedDays, MS_PER_DAY } from './timePolicy.js';

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15T12:00:00Z

describe('sanitizeClientTimestamp', () => {
  it('undefined → серверное время', () => {
    expect(sanitizeClientTimestamp(undefined, NOW)).toBe(NOW);
  });

  it('будущий клиентский таймстемп → серверное время (F04: не в будущем)', () => {
    expect(sanitizeClientTimestamp(NOW + 86_400_000, NOW)).toBe(NOW);
    expect(sanitizeClientTimestamp(NOW + 1, NOW)).toBe(NOW);
  });

  it('прошлый таймстемп остаётся — нужен для офлайн-elapsed', () => {
    const past = NOW - 86_400_000;
    expect(sanitizeClientTimestamp(past, NOW)).toBe(past);
  });

  it('NaN/бесконечность → серверное время', () => {
    expect(sanitizeClientTimestamp(Number.NaN, NOW)).toBe(NOW);
    expect(sanitizeClientTimestamp(Number.POSITIVE_INFINITY, NOW)).toBe(NOW);
    expect(sanitizeClientTimestamp(Number.NEGATIVE_INFINITY, NOW)).toBe(NOW);
  });
});

describe('computeElapsedDays', () => {
  it('нет последнего повторения → 0', () => {
    expect(computeElapsedDays(0, NOW, NOW)).toBe(0);
  });

  it('клиентский elapsed <= серверного → клиентский (легитимный офлайн)', () => {
    const last = NOW - 10 * MS_PER_DAY;
    // Ответ был 3 дня назад (офлайн), сервер видит это через 10 дней.
    expect(computeElapsedDays(last, NOW - 3 * MS_PER_DAY, NOW)).toBeCloseTo(7);
  });

  it('клиентский elapsed больше серверного → ограничен серверным (F04)', () => {
    const last = NOW - 2 * MS_PER_DAY;
    const client = NOW + 5 * MS_PER_DAY; // клиент врёт: «отвечал через 5 дней после серверного now»
    expect(computeElapsedDays(last, client, NOW)).toBeCloseTo(2);
  });

  it('lastReview в будущем → 0', () => {
    expect(computeElapsedDays(NOW + MS_PER_DAY, NOW, NOW)).toBe(0);
  });

  it('клиентский таймстемп раньше lastReview → 0 (отрицательный elapsed)', () => {
    const last = NOW - 5 * MS_PER_DAY;
    expect(computeElapsedDays(last, NOW - 10 * MS_PER_DAY, NOW)).toBe(0);
  });
});
