import { describe, it, expect } from 'vitest';
import { recalcFsrs, RATING_XP } from '@hanzi/mobile-sdk';

describe('FSRS on mobile (cross-platform)', () => {
  it('produces the same newStability as the server for a "Good" answer on a new card', () => {
    const out = recalcFsrs(3, 0, 0, 'new');
    // W[2] = 2.4 (initS[2] for rating 3)
    expect(out.newStability).toBeCloseTo(2.4, 5);
    expect(out.newState).toBe('learning');
    expect(out.intervalDays).toBe(1);
  });

  it('clamps an exploding stability value', () => {
    const out = recalcFsrs(4, 1e9, 0, 'review');
    expect(out.newStability).toBeLessThanOrEqual(36500);
  });

  it('awards the right XP for each rating', () => {
    expect(RATING_XP[1]).toBe(0);
    expect(RATING_XP[2]).toBe(1);
    expect(RATING_XP[3]).toBe(3);
    expect(RATING_XP[4]).toBe(5);
  });
});
