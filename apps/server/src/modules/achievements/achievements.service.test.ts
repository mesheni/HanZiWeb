import { describe, it, expect } from 'vitest';
import {
  pickGlobalUnlocks,
  unlockedSet,
  STREAK_7_TARGET,
  STREAK_30_TARGET,
  STREAK_100_TARGET,
  WORDS_100_TARGET,
  WORDS_500_TARGET,
  WORDS_1000_TARGET,
  REVIEWS_1K_TARGET,
  REVIEWS_10K_TARGET,
  REVIEWS_50K_TARGET,
  SPEED_DEMON_MIN,
  PERFECT_5_TARGET,
  XP_1000_TARGET,
  XP_5000_TARGET,
  XP_10000_TARGET,
} from './achievements.service.js';

function zeroStats() {
  return {
    currentStreak: 0,
    learnedWords: 0,
    totalReviews: 0,
    hsk1Mastered: 0,
    hsk1Total: 0,
    hsk2Mastered: 0,
    hsk2Total: 0,
    hsk3Mastered: 0,
    hsk3Total: 0,
    perfectSessionCount: 0,
    maxSessionAnswers: 0,
    hasEarlySession: false,
    hasNightSession: false,
    xp: 0,
  };
}

describe('Threshold constants', () => {
  it('match expected values', () => {
    expect(STREAK_7_TARGET).toBe(7);
    expect(STREAK_30_TARGET).toBe(30);
    expect(STREAK_100_TARGET).toBe(100);
    expect(WORDS_100_TARGET).toBe(100);
    expect(WORDS_500_TARGET).toBe(500);
    expect(WORDS_1000_TARGET).toBe(1000);
    expect(REVIEWS_1K_TARGET).toBe(1_000);
    expect(REVIEWS_10K_TARGET).toBe(10_000);
    expect(REVIEWS_50K_TARGET).toBe(50_000);
    expect(SPEED_DEMON_MIN).toBe(50);
    expect(PERFECT_5_TARGET).toBe(5);
    expect(XP_1000_TARGET).toBe(1_000);
    expect(XP_5000_TARGET).toBe(5_000);
    expect(XP_10000_TARGET).toBe(10_000);
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
    const out = pickGlobalUnlocks(zeroStats());
    expect(out).toEqual([]);
  });

  it('разблокирует first_review при 1+ ответе', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1 });
    expect(out).toContain('first_review');
  });

  it('не разблокирует first_review при 0 ответов', () => {
    const out = pickGlobalUnlocks(zeroStats());
    expect(out).not.toContain('first_review');
  });

  // Streaks
  it('разблокирует streak_7 при стрике >= 7', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, currentStreak: 7 });
    expect(out).toContain('streak_7');
  });

  it('не разблокирует streak_7 при стрике < 7', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, currentStreak: 6 });
    expect(out).not.toContain('streak_7');
  });

  it('разблокирует streak_30 при стрике >= 30', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, currentStreak: 30 });
    expect(out).toContain('streak_30');
  });

  it('разблокирует streak_100 при стрике >= 100', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, currentStreak: 100 });
    expect(out).toContain('streak_100');
  });

  // Words
  it('разблокирует words_100 при >= 100 выученных', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, learnedWords: 100 });
    expect(out).toContain('words_100');
  });

  it('не разблокирует words_100 при 99 выученных', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, learnedWords: 99 });
    expect(out).not.toContain('words_100');
  });

  it('разблокирует words_500 при >= 500', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, learnedWords: 500 });
    expect(out).toContain('words_500');
  });

  it('разблокирует words_1000 при >= 1000', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, learnedWords: 1000 });
    expect(out).toContain('words_1000');
  });

  // Reviews
  it('разблокирует reviews_1k при >= 1000 ответов', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1_000 });
    expect(out).toContain('reviews_1k');
  });

  it('разблокирует reviews_10k при >= 10 000 ответов', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 10_000 });
    expect(out).toContain('reviews_10k');
  });

  it('разблокирует reviews_50k при >= 50 000 ответов', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 50_000 });
    expect(out).toContain('reviews_50k');
  });

  // HSK
  it('не разблокирует hsk1_complete, если hsk1Total == 0', () => {
    const out = pickGlobalUnlocks(zeroStats());
    expect(out).not.toContain('hsk1_complete');
  });

  it('разблокирует hsk1_complete при hsk1Mastered == hsk1Total', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, hsk1Mastered: 150, hsk1Total: 150 });
    expect(out).toContain('hsk1_complete');
  });

  it('не разблокирует hsk1_complete, когда mastered < total', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, hsk1Mastered: 149, hsk1Total: 150 });
    expect(out).not.toContain('hsk1_complete');
  });

  it('разблокирует hsk2_complete при полном освоении HSK 2', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, hsk2Mastered: 150, hsk2Total: 150 });
    expect(out).toContain('hsk2_complete');
  });

  it('разблокирует hsk3_complete при полном освоении HSK 3', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, hsk3Mastered: 300, hsk3Total: 300 });
    expect(out).toContain('hsk3_complete');
  });

  // Speed
  it('разблокирует speed_demon при 50+ ответов в сессии', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, maxSessionAnswers: 50 });
    expect(out).toContain('speed_demon');
  });

  it('не разблокирует speed_demon при 49 ответов', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, maxSessionAnswers: 49 });
    expect(out).not.toContain('speed_demon');
  });

  // Time of day
  it('разблокирует early_bird при hasEarlySession', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, hasEarlySession: true });
    expect(out).toContain('early_bird');
  });

  it('не разблокирует early_bird при hasEarlySession=false', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, hasEarlySession: false });
    expect(out).not.toContain('early_bird');
  });

  it('разблокирует night_owl при hasNightSession', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, hasNightSession: true });
    expect(out).toContain('night_owl');
  });

  // Perfect sessions
  it('разблокирует perfect_5 при 5 идеальных сессиях', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, perfectSessionCount: 5 });
    expect(out).toContain('perfect_5');
  });

  it('не разблокирует perfect_5 при 4 идеальных сессиях', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, perfectSessionCount: 4 });
    expect(out).not.toContain('perfect_5');
  });

  // XP
  it('разблокирует xp_1000 при >= 1000 XP', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, xp: 1_000 });
    expect(out).toContain('xp_1000');
  });

  it('разблокирует xp_5000 при >= 5000 XP', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, xp: 5_000 });
    expect(out).toContain('xp_5000');
  });

  it('разблокирует xp_10000 при >= 10000 XP', () => {
    const out = pickGlobalUnlocks({ ...zeroStats(), totalReviews: 1, xp: 10_000 });
    expect(out).toContain('xp_10000');
  });

  it('не включает perfect_session (это per-session событие)', () => {
    const out = pickGlobalUnlocks({
      currentStreak: 999,
      learnedWords: 9999,
      totalReviews: 999_999,
      hsk1Mastered: 150,
      hsk1Total: 150,
      hsk2Mastered: 150,
      hsk2Total: 150,
      hsk3Mastered: 300,
      hsk3Total: 300,
      perfectSessionCount: 99,
      maxSessionAnswers: 100,
      hasEarlySession: true,
      hasNightSession: true,
      xp: 99_999,
    });
    expect(out).not.toContain('perfect_session');
    expect(out).toContain('first_review');
    expect(out).toContain('streak_7');
    expect(out).toContain('streak_30');
    expect(out).toContain('streak_100');
    expect(out).toContain('words_100');
    expect(out).toContain('words_500');
    expect(out).toContain('words_1000');
    expect(out).toContain('reviews_1k');
    expect(out).toContain('reviews_10k');
    expect(out).toContain('reviews_50k');
    expect(out).toContain('hsk1_complete');
    expect(out).toContain('hsk2_complete');
    expect(out).toContain('hsk3_complete');
    expect(out).toContain('speed_demon');
    expect(out).toContain('early_bird');
    expect(out).toContain('night_owl');
    expect(out).toContain('perfect_5');
    expect(out).toContain('xp_1000');
    expect(out).toContain('xp_5000');
    expect(out).toContain('xp_10000');
  });
});
