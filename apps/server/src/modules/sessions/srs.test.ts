import { describe, it, expect } from 'vitest';
import { recalcFsrs } from './srs.js';
import type { SrsRating, WordState } from '@hanzi/shared';

// Helper to reduce boilerplate
const again = 1 as SrsRating;
const hard = 2 as SrsRating;
const good = 3 as SrsRating;
const easy = 4 as SrsRating;

describe('FSRS recalcFsrs (v5)', () => {
  // ── Interval / due_date direction ──────────────────────────────────

  describe('interval direction', () => {
    it('returns interval 0 for Again rating (due_date resets)', () => {
      const result = recalcFsrs(again, 10, 0.5, 'review');
      expect(result.intervalDays).toBe(0);
    });

    it('returns positive interval for Good rating on review state', () => {
      const result = recalcFsrs(good, 10, 0.5, 'review');
      expect(result.intervalDays).toBeGreaterThan(0);
    });

    it('Easy rating produces larger interval than Good (same initial state)', () => {
      const rGood = recalcFsrs(good, 10, 0.5, 'review');
      const rEasy = recalcFsrs(easy, 10, 0.5, 'review');
      expect(rEasy.intervalDays).toBeGreaterThanOrEqual(rGood.intervalDays);
    });

    it('Hard rating produces non-zero interval', () => {
      const result = recalcFsrs(hard, 10, 0.5, 'review');
      expect(result.intervalDays).toBeGreaterThan(0);
    });
  });

  // ── State transitions ──────────────────────────────────────────────

  describe('state transitions', () => {
    it('new + Good → learning (first successful review, interval=1)', () => {
      const result = recalcFsrs(good, 0, 0, 'new');
      expect(result.newState).toBe('learning');
      expect(result.intervalDays).toBe(1);
    });

    it('new + Easy → learning (interval=1)', () => {
      const result = recalcFsrs(easy, 0, 0, 'new');
      expect(result.newState).toBe('learning');
      expect(result.intervalDays).toBe(1);
    });

    it('new + Hard → learning (interval=0 — show again today)', () => {
      const result = recalcFsrs(hard, 0, 0, 'new');
      expect(result.newState).toBe('learning');
      expect(result.intervalDays).toBe(0);
    });

    it('learning + Good → review (promoted after positive answer)', () => {
      const result = recalcFsrs(good, 2.4, 0.5, 'learning');
      expect(result.newState).toBe('review');
    });

    it('learning + Hard → stays learning (not promoted)', () => {
      const result = recalcFsrs(hard, 0.6, 0.5, 'learning');
      expect(result.newState).toBe('learning');
    });

    it('review + Easy + high stability → graduated', () => {
      const result = recalcFsrs(easy, 25, 0.3, 'review');
      expect(result.newState).toBe('graduated');
    });

    it('review stays review on Good rating', () => {
      const result = recalcFsrs(good, 10, 0.5, 'review');
      expect(result.newState).toBe('review');
    });

    it('graduated stays graduated on Good rating', () => {
      const result = recalcFsrs(good, 30, 0.3, 'graduated');
      expect(result.newState).toBe('graduated');
    });

    it('graduated drops to review on Hard rating', () => {
      const result = recalcFsrs(hard, 30, 0.3, 'graduated');
      expect(result.newState).toBe('review');
    });

    it('Again + graduated → review (not all the way to learning)', () => {
      const result = recalcFsrs(again, 30, 0.3, 'graduated');
      expect(result.newState).toBe('review');
      expect(result.intervalDays).toBe(0);
    });

    it('Again + review → learning', () => {
      const result = recalcFsrs(again, 10, 0.5, 'review');
      expect(result.newState).toBe('learning');
      expect(result.intervalDays).toBe(0);
    });

    it('Again + new → learning', () => {
      const result = recalcFsrs(again, 0, 0, 'new');
      expect(result.newState).toBe('learning');
      expect(result.intervalDays).toBe(0);
    });
  });

  // ── Difficulty direction ───────────────────────────────────────────

  describe('difficulty direction', () => {
    it('increases difficulty on Again rating', () => {
      const result = recalcFsrs(again, 10, 0.5, 'review');
      expect(result.newDifficulty).toBeGreaterThan(0.5);
    });

    it('increases difficulty on Hard rating', () => {
      const result = recalcFsrs(hard, 10, 0.5, 'review');
      expect(result.newDifficulty).toBeGreaterThan(0.5);
    });

    it('decreases difficulty on Easy rating', () => {
      const result = recalcFsrs(easy, 10, 0.5, 'review');
      expect(result.newDifficulty).toBeLessThan(0.5);
    });

    it('Good rating keeps difficulty unchanged (delta = 0)', () => {
      const result = recalcFsrs(good, 10, 0.5, 'review');
      // delta = 0.86 * (3 − 3) = 0 → difficulty stays at 0.5
      expect(result.newDifficulty).toBe(0.5);
    });
  });

  // ── Stability bounds ───────────────────────────────────────────────

  describe('stability bounds', () => {
    it('stability is always at least 0.01 (floor after failure)', () => {
      const result = recalcFsrs(again, 0.5, 0.5, 'review');
      expect(result.newStability).toBeGreaterThanOrEqual(0.01);
    });

    it('initial stability for Again on new card is 0.4 (w0)', () => {
      const result = recalcFsrs(again, 0, 0, 'new');
      expect(result.newStability).toBe(0.4);
    });

    it('initial stability for Easy on new card is 5.8 (w3)', () => {
      const result = recalcFsrs(easy, 0, 0, 'new');
      expect(result.newStability).toBe(5.8);
    });

    it('stability grows on Good for a previously reviewed card', () => {
      const result = recalcFsrs(good, 10, 0.5, 'review');
      expect(result.newStability).toBeGreaterThan(10);
    });
  });

  // ── Difficulty bounds ─────────────────────────────────────────────

  describe('difficulty bounds', () => {
    it('difficulty clamped at lower bound (0)', () => {
      // Easy (delta −0.86) on already low difficulty
      const result = recalcFsrs(easy, 10, 0.01, 'review');
      expect(result.newDifficulty).toBeGreaterThanOrEqual(0);
      expect(result.newDifficulty).toBeLessThanOrEqual(1);
    });

    it('difficulty clamped at upper bound (1)', () => {
      // Again (delta +1.72) on very high difficulty
      const result = recalcFsrs(again, 10, 0.95, 'review');
      expect(result.newDifficulty).toBeGreaterThanOrEqual(0);
      expect(result.newDifficulty).toBeLessThanOrEqual(1);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('very high stability still produces valid output', () => {
      const result = recalcFsrs(good, 1000, 0.3, 'graduated');
      expect(result.newStability).toBeGreaterThan(0);
      expect(result.intervalDays).toBeGreaterThan(0);
      expect(result.newState).toBe('graduated');
    });

    it('new card + Easy gives initial stability = 5.8 (w3)', () => {
      const result = recalcFsrs(easy, 0, 0, 'new');
      expect(result.newStability).toBe(5.8);
      expect(result.newState).toBe('learning');
    });

    it('intervalDays is always an integer', () => {
      const result = recalcFsrs(good, 3.7, 0.5, 'review');
      expect(Number.isInteger(result.intervalDays)).toBe(true);
    });

    it('intervalDays is non-negative for all rating × state combinations', () => {
      const states: WordState[] = ['new', 'learning', 'review', 'graduated'];
      const ratings: SrsRating[] = [again, hard, good, easy];

      for (const state of states) {
        for (const rating of ratings) {
          const result = recalcFsrs(rating, 5, 0.5, state);
          expect(
            result.intervalDays,
            `intervalDays should be >= 0 for rating=${rating} state=${state}`,
          ).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('newState is always a valid WordState', () => {
      const states: WordState[] = ['new', 'learning', 'review', 'graduated'];
      const validStates = new Set(states);

      for (const state of states) {
        for (const rating of [again, hard, good, easy] as const) {
          const result = recalcFsrs(rating, 5, 0.5, state);
          expect(
            validStates.has(result.newState),
            `invalid newState '${result.newState}' for rating=${rating} state=${state}`,
          ).toBe(true);
        }
      }
    });
  });
});
