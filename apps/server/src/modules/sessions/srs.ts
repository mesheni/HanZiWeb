import type { SrsRating, WordState } from '@hanzi/shared';

/**
 * FSRS (Free Spaced Repetition Scheduler) — упрощённая заглушка.
 * TODO: Заменить на полноценную реализацию FSRS v5.
 *
 * Параметры:
 * - rating: оценка пользователя (1=Again, 2=Hard, 3=Good, 4=Easy)
 * - currentStability: текущая стабильность памяти (дни)
 * - currentDifficulty: текущая сложность (0..1)
 * - currentState: текущее состояние слова
 *
 * Возвращает:
 * - newStability: новая стабильность
 * - newDifficulty: новая сложность
 * - newState: новое состояние
 * - intervalDays: интервал до следующего показа
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
  // Коэффициенты (заглушка)
  const difficultyDelta: Record<SrsRating, number> = {
    1: 0.15, // Again → сложность растёт
    2: 0.05, // Hard
    3: -0.05, // Good → сложность падает
    4: -0.1, // Easy
  };

  const stabilityMultiplier: Record<SrsRating, number> = {
    1: 0.5, // Again → стабильность падает
    2: 1.2, // Hard
    3: 2.5, // Good
    4: 4.0, // Easy
  };

  const intervalMultiplier: Record<SrsRating, number> = {
    1: 0, // Again → завтра
    2: 0.8, // Hard → 80% интервала
    3: 1.0, // Good → полный интервал
    4: 1.3, // Easy → +30%
  };

  const newDifficulty = Math.max(0, Math.min(1, currentDifficulty + difficultyDelta[rating]));
  const newStability = Math.max(0.5, currentStability * stabilityMultiplier[rating]);

  const baseInterval = Math.max(1, Math.round(newStability * intervalMultiplier[rating]));

  let intervalDays: number;
  let newState: WordState;

  if (rating === 1) {
    // Again — возвращаем в learning
    newState = 'learning';
    intervalDays = 0; // показать сегодня/завтра
  } else if (currentState === 'new' || currentState === 'learning') {
    newState = 'review';
    intervalDays = 1; // первый показ завтра
  } else if (currentState === 'review') {
    newState = rating === 4 ? 'graduated' : 'review';
    intervalDays = baseInterval;
  } else {
    // graduated
    // rating 1 → already handled above; 2 (hard) → back to review; 3/4 → stay graduated
    const r = rating as number;
    newState = r <= 2 ? 'review' : 'graduated';
    intervalDays = baseInterval;
  }

  return { newStability, newDifficulty, newState, intervalDays };
}
