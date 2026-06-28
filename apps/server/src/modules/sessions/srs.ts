import type { SrsRating, WordState } from '@hanzi/shared';

// =============================================================================
// FSRS v5 — Free Spaced Repetition Scheduler (full 17-parameter implementation)
// =============================================================================
// Based on the FSRS v5 algorithm by Jarrett Ye (open-spaced-repetition).
// Uses the official memory model with retrievability, stability growth/decay,
// and difficulty adaptation.
//
// References:
//   https://github.com/open-spaced-repetition/fsrs4anki/wiki/FSRS
//   https://github.com/open-spaced-repetition/ts-fsrs
// =============================================================================

/** FSRS v5 hyperparameters (w0–w16) */
const W = [
  0.4,   // w0:  initial stability after rating Again
  0.6,   // w1:  initial stability after rating Hard
  2.4,   // w2:  initial stability after rating Good
  5.8,   // w3:  initial stability after rating Easy
  4.93,  // w4:  initial difficulty formula offset
  0.94,  // w5:  initial difficulty formula exponent
  0.86,  // w6:  difficulty delta per rating step
  0.01,  // w7:  difficulty mean-reversion weight
  1.49,  // w8:  stability increase factor coefficient
  0.14,  // w9:  stability exponent for success
  0.94,  // w10: retrievability impact for success
  2.18,  // w11: post-failure stability coefficient
  0.05,  // w12: post-failure stability exponent
  0.34,  // w13: post-failure retrievability factor
  1.26,  // w14: (reserved)
  0.29,  // w15: Hard penalty multiplier on stability
  2.61,  // w16: Easy bonus multiplier on stability
] as const;

/** Target retention (90%) */
const FACTOR = 0.9;

/** Stability decay exponent for the success formula */
const DECAY = -0.5;

/** Maximum interval cap in days (~100 years) */
const MAX_INTERVAL = 36500;

/** Interval modifiers per rating — applied to final stability to get interval */
const INTERVAL_MOD: Record<SrsRating, number> = {
  1: 0,
  2: 0.8,
  3: 1.0,
  4: 1.3,
};

// ---- Private helpers -------------------------------------------------------

/**
 * Estimate retrievability R = probability of recall.
 *
 * Since we do not have the actual elapsed time since last review as a parameter,
 * we assume the review occurs exactly at the due date (elapsed ≈ stability).
 * This gives R = exp(ln(FACTOR)) = FACTOR for every card that has been reviewed
 * before.  For a brand-new card (stability = 0), retrievability is 1.
 */
function computeRetrievability(stability: number): number {
  if (stability <= 0) return 1;
  // elapsed = stability  →  elapsed / stability = 1  →  R = FACTOR
  return FACTOR;
}

/**
 * Compute the new difficulty after a review.
 *
 * D' = D + w6 * (3 – rating)
 *
 * Difficulty increases when the user struggles (Again / Hard) and decreases
 * when they recall easily (Easy).  The raw result is clamped to [0, 1] to
 * match the application's internal representation.
 */
function computeDifficulty(rating: SrsRating, current: number): number {
  const delta = W[6] * (3 - rating);
  const raw = current + delta;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Compute stability after a **failure** (rating = Again) on a card that has
 * been reviewed at least once before.
 */
function stabilityAfterFailure(stability: number, r: number): number {
  const s = Math.max(0.01, stability);
  return W[11] * Math.pow(s, W[12]) * Math.exp((1 - r) * W[13]);
}

/**
 * Compute stability after a **success** (rating = Hard / Good / Easy) on a
 * card that has been reviewed at least once before.
 */
function stabilityAfterSuccess(
  rating: SrsRating,
  stability: number,
  difficulty: number,
  r: number,
): number {
  const s = Math.max(0.01, stability);

  // Core FSRS v5 stability-increase factor
  const sInc =
    1 +
    Math.exp(W[8]) *
      (11 - difficulty) *
      Math.pow(s, DECAY) *
      (Math.exp((1 - r) * W[10]) - 1);

  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;

  return s * sInc * hardPenalty * easyBonus;
}

/**
 * Map raw stability to a scheduling interval in days.
 */
function toInterval(stability: number, rating: SrsRating): number {
  return Math.max(1, Math.round(stability * INTERVAL_MOD[rating]));
}

// ---- Public API ------------------------------------------------------------

/**
 * FSRS v5 (Free Spaced Repetition Scheduler) — full implementation.
 *
 * Recalculates the memory model parameters after a single review event.
 *
 * @param rating            User self-assessment (1=Again, 2=Hard, 3=Good, 4=Easy)
 * @param currentStability  Current memory stability (days)
 * @param currentDifficulty Current perceived difficulty (0..1)
 * @param currentState      Current word state (new | learning | review | graduated)
 *
 * @returns Updated `{ newStability, newDifficulty, newState, intervalDays }`
 *          ready to be persisted into `UserWordProgress`.
 */
export function recalcFsrs(
  rating: SrsRating,
  currentStability: number,
  currentDifficulty: number,
  currentState: WordState,
): {
  newStability: number;
  newDifficulty: number;
  newState: WordState;
  intervalDays: number;
} {
  // ---- 1. Retrievability ------------------------------------------------
  const retrievability = computeRetrievability(currentStability);

  // ---- 2. Difficulty ----------------------------------------------------
  const newDifficulty = computeDifficulty(rating, currentDifficulty);

  // ---- 3. Stability -----------------------------------------------------
  let newStability: number;

  if (currentState === 'new') {
    // First-ever review — use fixed initial stabilities
    const initS = [W[0], W[1], W[2], W[3]];
    newStability = initS[rating - 1]!;
  } else if (rating === 1) {
    // Failure (Again) on a previously reviewed card
    newStability = stabilityAfterFailure(currentStability, retrievability);
  } else {
    // Success (Hard / Good / Easy) on a previously reviewed card
    newStability = stabilityAfterSuccess(
      rating,
      currentStability,
      newDifficulty,
      retrievability,
    );
  }

  newStability = Math.max(0.01, Math.min(MAX_INTERVAL, newStability));

  // ---- 4. State transition & interval -----------------------------------
  let newState: WordState;
  let intervalDays: number;

  if (rating === 1) {
    // Again: drop back — graduated cards go to review, everything else to learning
    newState = currentState === 'graduated' ? 'review' : 'learning';
    intervalDays = 0; // show again today
  } else if (currentState === 'new') {
    // First successful review (Hard / Good / Easy) → enter learning phase
    newState = 'learning';
    intervalDays = rating >= 3 ? 1 : 0; // Good/Easy → tomorrow; Hard → today
  } else if (currentState === 'learning') {
    // Still in learning — promote to review only after Good/Easy
    newState = rating >= 3 ? 'review' : 'learning';
    intervalDays = toInterval(newStability, rating);
  } else if (currentState === 'review') {
    // In review — graduate after Easy with high stability
    newState = rating === 4 && newStability >= 21 ? 'graduated' : 'review';
    intervalDays = toInterval(newStability, rating);
  } else {
    // graduated — Again/Hard drops back to review, Good/Easy stays graduated
    newState = rating <= 2 ? 'review' : 'graduated';
    intervalDays = toInterval(newStability, rating);
  }

  return { newStability, newDifficulty, newState, intervalDays };
}
