import type { SrsRating, WordState } from '@hanzi/shared';

const W = [
  0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14,
  0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61,
] as const;

const FACTOR = 0.9;
const DECAY = -0.5;
const MAX_INTERVAL = 36500;

const INTERVAL_MOD: Record<SrsRating, number> = {
  1: 0, 2: 0.8, 3: 1.0, 4: 1.3,
};

function computeRetrievability(stability: number): number {
  if (stability <= 0) return 1;
  return FACTOR;
}

function computeDifficulty(rating: SrsRating, current: number): number {
  const delta = W[6] * (3 - rating);
  return Math.max(0, Math.min(1, current + delta));
}

function stabilityAfterFailure(stability: number, r: number): number {
  const s = Math.max(0.01, stability);
  return W[11] * Math.pow(s, W[12]) * Math.exp((1 - r) * W[13]);
}

function stabilityAfterSuccess(
  rating: SrsRating,
  stability: number,
  difficulty: number,
  r: number,
): number {
  const s = Math.max(0.01, stability);
  const sInc =
    1 +
    Math.exp(W[8]) * (11 - difficulty) * Math.pow(s, DECAY) * (Math.exp((1 - r) * W[10]) - 1);
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  return s * sInc * hardPenalty * easyBonus;
}

function toInterval(stability: number, rating: SrsRating): number {
  return Math.max(1, Math.round(stability * INTERVAL_MOD[rating]));
}

export interface FsrsUpdate {
  newStability: number;
  newDifficulty: number;
  newState: WordState;
  intervalDays: number;
}

/**
 * FSRS v5 single-step update. Mirrors the implementation in
 * `apps/server/src/modules/sessions/srs.ts` and
 * `apps/web/src/db/fsrs.ts` so the offline client produces the exact
 * same stability / difficulty / due date as the server.
 */
export function recalcFsrs(
  rating: SrsRating,
  currentStability: number,
  currentDifficulty: number,
  currentState: WordState,
): FsrsUpdate {
  const retrievability = computeRetrievability(currentStability);
  const newDifficulty = computeDifficulty(rating, currentDifficulty);

  let newStability: number;
  if (currentState === 'new') {
    const initS = [W[0], W[1], W[2], W[3]];
    newStability = initS[rating - 1]!;
  } else if (rating === 1) {
    newStability = stabilityAfterFailure(currentStability, retrievability);
  } else {
    newStability = stabilityAfterSuccess(rating, currentStability, newDifficulty, retrievability);
  }
  newStability = Math.max(0.01, Math.min(MAX_INTERVAL, newStability));

  let newState: WordState;
  let intervalDays: number;

  if (rating === 1) {
    newState = currentState === 'graduated' ? 'review' : 'learning';
    intervalDays = 0;
  } else if (currentState === 'new') {
    newState = 'learning';
    intervalDays = rating >= 3 ? 1 : 0;
  } else if (currentState === 'learning') {
    newState = rating >= 3 ? 'review' : 'learning';
    intervalDays = toInterval(newStability, rating);
  } else if (currentState === 'review') {
    newState = rating === 4 && newStability >= 21 ? 'graduated' : 'review';
    intervalDays = toInterval(newStability, rating);
  } else {
    newState = rating <= 2 ? 'review' : 'graduated';
    intervalDays = toInterval(newStability, rating);
  }

  return { newStability, newDifficulty, newState, intervalDays };
}

/** XP awarded for a given rating (matches `RATING_XP` on the server). */
export const RATING_XP: Record<SrsRating, number> = {
  1: 0, 2: 1, 3: 3, 4: 5,
};
