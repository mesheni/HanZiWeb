import { describe, it, expect } from 'vitest';
import {
  pickGlobalUnlocks,
  unlockedSet,
  STREAK_7_TARGET,
  WORDS_100_TARGET,
  REVIEWS_10K_TARGET,
} from './achievements.service.js';

describe('STREAK_7_TARGET / WORDS_100_TARGET / REVIEWS_10K_TARGET', () => {
  it('экспортируются с ожидаемыми значениями', () => {
    expect(STREAK_7_TARGET).toBe(7);
    expect(WORDS_100_TARGET).toBe(100);
    expect(REVIEWS_10K_TARGET).toBe(10_000);
  });
});

describe('unlockedSet', () => {
  it('возвращает Set с типами из плоского списка', () => {
    const out = unlockedSet([{ type: 'streak_7' }, { type: 'words_100' }]);
    expect(out.has('streak_7')).toBe(true);
    expect(out.has('words_100')).toBe(true);
    expect(out.size).toBe(2);
  });

  it('возвращает пустой Set для пустого ввода', () => {
    expect(unlockedSet([]).size).toBe(0);
  });
});

describe('pickGlobalUnlocks', () => {
  it('не возвращает ничего при нулевых показателях', () => {
    const out = pickGlobalUnlocks({
      currentStreak: 0,
      learnedWords: 0,
      totalReviews: 0,
      hsk1Mastered: 0,
      hsk1Total: 0,
    });
    expect(out).toEqual([]);
  });

  it('разблокирует streak_7 при стрике >= 7', () => {
    const out = pickGlobalUnlocks({
      currentStreak: 7,
      learnedWords: 0,
      totalReviews: 0,
      hsk1Mastered: 0,
      hsk1Total: 0,
    });
    expect(out).toContain('streak_7');
  });

  it('не разблокирует streak_7 при стрике < 7', () => {
    const out = pickGlobalUnlocks({
      currentStreak: 6,
      learnedWords: 0,
      totalReviews: 0,
      hsk1Mastered: 0,
      hsk1Total: 0,
    });
    expect(out).not.toContain('streak_7');
  });

  it('разблокирует words_100 при >= 100 выученных', () => {
    const out = pickGlobalUnlocks({
      currentStreak: 0,
      learnedWords: 100,
      totalReviews: 0,
      hsk1Mastered: 0,
      hsk1Total: 0,
    });
    expect(out).toContain('words_100');
  });

  it('не разблокирует words_100 при 99 выученных', () => {
    const out = pickGlobalUnlocks({
      currentStreak: 0,
      learnedWords: 99,
      totalReviews: 0,
      hsk1Mastered: 0,
      hsk1Total: 0,
    });
    expect(out).not.toContain('words_100');
  });

  it('разблокирует reviews_10k при >= 10 000 ответов', () => {
    const out = pickGlobalUnlocks({
      currentStreak: 0,
      learnedWords: 0,
      totalReviews: 10_000,
      hsk1Mastered: 0,
      hsk1Total: 0,
    });
    expect(out).toContain('reviews_10k');
  });

  it('не разблокирует hsk1_complete, если hsk1Total == 0', () => {
    // Защита от ложного срабатывания на пустой базе HSK 1.
    const out = pickGlobalUnlocks({
      currentStreak: 0,
      learnedWords: 0,
      totalReviews: 0,
      hsk1Mastered: 0,
      hsk1Total: 0,
    });
    expect(out).not.toContain('hsk1_complete');
  });

  it('разблокирует hsk1_complete при hsk1Mastered == hsk1Total', () => {
    const out = pickGlobalUnlocks({
      currentStreak: 0,
      learnedWords: 0,
      totalReviews: 0,
      hsk1Mastered: 150,
      hsk1Total: 150,
    });
    expect(out).toContain('hsk1_complete');
  });

  it('не разблокирует hsk1_complete, когда mastered < total', () => {
    const out = pickGlobalUnlocks({
      currentStreak: 0,
      learnedWords: 0,
      totalReviews: 0,
      hsk1Mastered: 149,
      hsk1Total: 150,
    });
    expect(out).not.toContain('hsk1_complete');
  });

  it('не включает perfect_session (это per-session событие)', () => {
    const out = pickGlobalUnlocks({
      currentStreak: 999,
      learnedWords: 999,
      totalReviews: 999_999,
      hsk1Mastered: 150,
      hsk1Total: 150,
    });
    expect(out).not.toContain('perfect_session');
    // Все остальные должны быть разблокированы
    expect(out).toContain('streak_7');
    expect(out).toContain('words_100');
    expect(out).toContain('reviews_10k');
    expect(out).toContain('hsk1_complete');
  });
});
