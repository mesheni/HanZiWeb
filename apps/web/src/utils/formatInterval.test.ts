import { describe, it, expect } from 'vitest';
import { formatInterval } from './formatInterval';

describe('formatInterval', () => {
  it('returns "сейчас" for zero and learning-step intervals', () => {
    expect(formatInterval(0)).toBe('сейчас');
    expect(formatInterval(-1)).toBe('сейчас');
    expect(formatInterval(Number.NaN)).toBe('сейчас');
  });

  it('returns "завтра" for a single day', () => {
    expect(formatInterval(1)).toBe('завтра');
  });

  it('pluralizes days correctly in Russian', () => {
    expect(formatInterval(2)).toBe('2 дня');
    expect(formatInterval(5)).toBe('5 дней');
    expect(formatInterval(11)).toBe('11 дней');
    expect(formatInterval(21)).toBe('21 день');
    expect(formatInterval(22)).toBe('22 дня');
    expect(formatInterval(30)).toBe('30 дней');
  });

  it('switches to months from 31 days', () => {
    expect(formatInterval(31)).toBe('~1 мес');
    expect(formatInterval(60)).toBe('~2 мес');
    expect(formatInterval(365)).toBe('~12 мес');
  });
});
