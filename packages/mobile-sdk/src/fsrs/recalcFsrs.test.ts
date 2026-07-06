import { describe, it, expect } from 'vitest';
import { recalcFsrs, RATING_XP } from './recalcFsrs';
import type { SrsRating, WordState } from '@hanzi/shared';

describe('recalcFsrs', () => {
  it('first-time "Easy" (rating 4) sets state to learning with 1-day interval', () => {
    const out = recalcFsrs(4, 0, 0, 'new');
    expect(out.newState).toBe<SrsRating | WordState>('learning');
    expect(out.intervalDays).toBe(1);
    expect(out.newStability).toBeGreaterThan(0);
  });

  it('first-time "Again" (rating 1) keeps state in learning with 0-day interval', () => {
    const out = recalcFsrs(1, 0, 0, 'new');
    expect(out.newState).toBe('learning');
    expect(out.intervalDays).toBe(0);
  });

  it('"Again" demotes a graduated word back to review', () => {
    const out = recalcFsrs(1, 30, 0.3, 'graduated');
    expect(out.newState).toBe('review');
    expect(out.intervalDays).toBe(0);
  });

  it('"Easy" on a stable review card promotes to graduated when stability >= 21', () => {
    const out = recalcFsrs(4, 25, 0.2, 'review');
    expect(out.newState).toBe('graduated');
    expect(out.intervalDays).toBeGreaterThan(0);
  });

  it('clamps difficulty to [0, 1]', () => {
    const out1 = recalcFsrs(4, 5, 0, 'review');
    expect(out1.newDifficulty).toBeGreaterThanOrEqual(0);
    expect(out1.newDifficulty).toBeLessThanOrEqual(1);

    const out2 = recalcFsrs(1, 5, 1, 'review');
    expect(out2.newDifficulty).toBeGreaterThanOrEqual(0);
    expect(out2.newDifficulty).toBeLessThanOrEqual(1);
  });

  it('clamps stability to [0.01, 36500]', () => {
    const out = recalcFsrs(4, 1e9, 0.5, 'review');
    expect(out.newStability).toBeLessThanOrEqual(36500);
    expect(out.newStability).toBeGreaterThanOrEqual(0.01);
  });

  it('RATING_XP matches the server-side constant', () => {
    expect(RATING_XP).toEqual({ 1: 0, 2: 1, 3: 3, 4: 5 });
  });
});
