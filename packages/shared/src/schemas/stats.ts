import { z } from 'zod';

/**
 * Study Map — визуальная карта прогресса по колодам (PLAN_Features_v0.3 §5).
 *
 * Эндпоинт `GET /api/stats/study-map` возвращает прогресс пользователя
 * по каждой не-системной колоде: общее число слов, число изученных
 * (state = graduated или mastered), процент и цветовой уровень.
 *
 * Цветовые уровни соответствуют шкале из `global.css`:
 *   `low`      — 0–25%   (красный)
 *   `medium`   — 25–50%  (жёлтый)
 *   `high`     — 50–75%  (зелёный)
 *   `complete` — 75–100% (ярко-зелёный)
 *
 * Примечание: в текущей модели SRS есть только `graduated` (нет `mastered`).
 * Поле `learnedWords` считается как `graduated` — это согласовано с
 * `getOverview`, где `learnedWords = graduated + review`. «Изученным» в
 * контексте карты считаем только `graduated`, чтобы проценты были
 * монотонными и стимулировали довести колоду до конца.
 */

/** Цветовой уровень прогресса колоды. */
export const DeckProgressColorSchema = z.enum(['low', 'medium', 'high', 'complete']);
export type DeckProgressColor = z.infer<typeof DeckProgressColorSchema>;

/** Прогресс по одной колоде. */
export const DeckProgressSchema = z.object({
  /** UUID колоды. */
  deckId: z.string().uuid(),
  /** Название колоды (для UI). */
  deckName: z.string().min(1).max(100),
  /** true, если колода системная (HSK). */
  isSystemDeck: z.boolean(),
  /** Общее количество слов в колоде (DeckWord count). */
  totalWords: z.number().int().nonnegative(),
  /** Сколько слов в состоянии graduated. */
  learnedWords: z.number().int().nonnegative(),
  /** Процент 0..100. 0 если totalWords = 0. */
  percentage: z.number().min(0).max(100),
  /** Цветовой уровень для UI. */
  color: DeckProgressColorSchema,
});
export type DeckProgress = z.infer<typeof DeckProgressSchema>;

/** Ответ `GET /stats/study-map`. */
export const StudyMapResponseSchema = z.object({
  /** Прогресс по каждой колоде. */
  decks: z.array(DeckProgressSchema),
  /** Суммарное число слов по всем колодам. */
  totalWords: z.number().int().nonnegative(),
  /** Суммарное число изученных слов. */
  totalLearned: z.number().int().nonnegative(),
  /** Общий процент по всем колодам (0..100), 0 если totalWords = 0. */
  overallPercentage: z.number().min(0).max(100),
});
export type StudyMapResponse = z.infer<typeof StudyMapResponseSchema>;

/**
 * Маппинг процента → цветовой уровень. Чистая функция, покрыта
 * юнит-тестами на сервере.
 *
 * Границы: <25 = low, <50 = medium, <75 = high, иначе complete.
 */
export function getDeckProgressColor(percentage: number): DeckProgressColor {
  if (percentage >= 75) return 'complete';
  if (percentage >= 50) return 'high';
  if (percentage >= 25) return 'medium';
  return 'low';
}
