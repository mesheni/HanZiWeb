import type { PracticeType } from '../schemas/session.js';

/**
 * Категории тренировочных режимов (PLAN_Features_v0.3 §20).
 *
 * - **Изучение** (`study`) — режимы, которые двигают FSRS-прогресс.
 *   Сейчас это только `flip-card`: пользователь оценивает знание слова
 *   (1/2/3/4), и сервер пересчитывает SRS-параметры + начисляет XP.
 *
 * - **Тренировка** (`training`) — режимы, которые НЕ двигают прогресс.
 *   Они нужны для практики и запоминания, но НЕ для оценки знания:
 *   ответы записываются только локально (для статистики сессии), и
 *   никак не влияют ни на `UserWordProgress`, ни на XP, ни на
 *   достижения. Это защищает прогресс от случайной порчи в
 *   «игровых» режимах.
 */
export type PracticeCategory = 'study' | 'training';

/**
 * Тренировочные (не-FSRS) режимы. Все, кроме `flip-card`.
 * Источник истины для обоих клиентов: web (`PracticeTypeSelector`,
 * `useStudySession`, `StudyScreen`) и server (`sessions.service`).
 */
export const TRAINING_PRACTICE_TYPES: readonly PracticeType[] = [
  'multiple-choice',
  'reverse-choice',
  'pinyin-input',
  'tone-recognition',
  'syllable-constructor',
  'cloze',
  'character_assembly',
] as const;

/** Set-форма для O(1) lookup-а (избегаем `.includes()` на каждом рендере). */
const TRAINING_SET: ReadonlySet<PracticeType> = new Set(TRAINING_PRACTICE_TYPES);

/** Возвращает `true` для режимов, которые НЕ двигают FSRS-прогресс. */
export function isTrainingPractice(type: PracticeType): boolean {
  return TRAINING_SET.has(type);
}

/** Возвращает категорию режима — `'study'` или `'training'`. */
export function getPracticeCategory(type: PracticeType): PracticeCategory {
  return TRAINING_SET.has(type) ? 'training' : 'study';
}
