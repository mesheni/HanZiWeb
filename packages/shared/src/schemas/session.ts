import { z } from 'zod';
import { SrsRatingSchema, WordStateSchema } from './progress.js';
import { WordSchema } from './word.js';

/** Режим запуска учебной сессии (выбор контента). */
export const StudyModeSchema = z.enum(['mixed', 'review', 'learn']);
export type StudyMode = z.infer<typeof StudyModeSchema>;

/**
 * Тип практики в рамках сессии (как именно тренировать слова).
 *
 * - `flip-card`              — классическая flash-карточка (фронт/тыл).
 * - `multiple-choice`        — китайский иероглиф → 4 варианта перевода.
 * - `reverse-choice`         — русский перевод → 4 варианта иероглифа.
 * - `pinyin-input`           — набрать пиньинь по иероглифу (input + parsePinyin).
 * - `tone-recognition`       — воспроизвести TTS и выбрать тон (1/2/3/4).
 * - `syllable-constructor`   — drag-and-drop слогов пиньиня в правильном порядке.
 * - `cloze`                  — подставить пропущенное слово в предложении-примере.
 * - `character_assembly`     — собрать слово из иероглифов в правильном порядке.
 */
export const PracticeTypeSchema = z.enum([
  'flip-card',
  'multiple-choice',
  'reverse-choice',
  'pinyin-input',
  'tone-recognition',
  'syllable-constructor',
  'cloze',
  'character_assembly',
]);
export type PracticeType = z.infer<typeof PracticeTypeSchema>;

/**
 * Учебная сессия — набор карточек на повторение.
 */
export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  /** Идентификатор колоды (null = микс из всех доступных) */
  deckId: z.string().uuid().nullable().default(null),
  /** Название колоды для UI */
  deckName: z.string().optional(),
  /** Общее количество карточек в сессии */
  cardsTotal: z.number().int().positive(),
  /** Сколько уже отвечено */
  cardsCompleted: z.number().int().nonnegative().default(0),
  /** Режим сессии (микс/повтор/новые). */
  mode: StudyModeSchema.default('mixed'),
  /** Тип практики (flip-card, multiple-choice, …). */
  practiceType: PracticeTypeSchema.default('flip-card'),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
});

export type Session = z.infer<typeof SessionSchema>;

/** Карточка в рамках сессии — слово + контекст */
export const SessionCardSchema = z.object({
  /** Порядковый номер (0-based) */
  index: z.number().int().nonnegative(),
  word: WordSchema,
  /** Был ли уже дан ответ */
  answered: z.boolean().default(false),
  /** Оценка, если ответ уже дан */
  rating: SrsRatingSchema.optional(),
  /** Текущее состояние слова (new/learning/review/graduated) */
  state: WordStateSchema.default('new'),
  /** Дистракторы для режима `character_assembly` (иероглифы из других слов). */
  distractors: z.array(z.string()).default([]),
});

export type SessionCard = z.infer<typeof SessionCardSchema>;

/**
 * Фильтры сессии (см. PLAN_Features_v0.2 §12).
 *
 * - `minStability` / `maxStability` — ограничение по FSRS stability (дни).
 *   Полезно для тренировки «забываемых» карточек: `minStability <= 7` и
 *   `maxStability <= 21` даёт быстро-забываемые слова. `0` означает «без
 *   ограничения» со стороны min/max.
 * - `tags` — массив id тегов; карточка должна иметь **хотя бы один** из них.
 *   Если массив пуст или не передан — фильтр не применяется.
 * - `onlyWithAudio` — пропускать слова без `audioUrl`.
 * - `onlyWithMnemonic` — пропускать слова без `mnemonic`.
 */
export const SessionFiltersSchema = z.union([
  z.undefined(),
  z
    .object({
      minStability: z.number().nonnegative().optional(),
      maxStability: z.number().positive().optional(),
      tags: z.array(z.string().uuid()).max(20).optional(),
      onlyWithAudio: z.boolean().optional(),
      onlyWithMnemonic: z.boolean().optional(),
    })
    .strict(),
]);

export type SessionFilters = z.infer<typeof SessionFiltersSchema>;

/** Полная сессия с карточками */
export const FullSessionSchema = SessionSchema.extend({
  cards: z.array(SessionCardSchema),
  /** Фильтры, реально применённые к сессии (для UI-отображения). */
  appliedFilters: SessionFiltersSchema.nullable().optional(),
});

export type FullSession = z.infer<typeof FullSessionSchema>;

/** DTO для старта новой сессии */
export const StartSessionSchema = z.object({
  deckId: z.string().uuid().optional(),
  /** Сколько карточек (max). По умолчанию 20. */
  cardLimit: z.number().int().min(1).max(50).default(20),
  /** Добавлять ли новые слова в микс (true = микс новых + повтор) */
  includeNew: z.boolean().default(true),
  /** Режим сессии: микс, только повтор, только новые слова. */
  mode: StudyModeSchema.default('mixed'),
  /** Тип практики в сессии. По умолчанию — flip-card. */
  practiceType: PracticeTypeSchema.default('flip-card'),
  /** Фильтры по «лёгкости» (stability) и метаданным слова. */
  filters: SessionFiltersSchema.optional(),
});

export type StartSession = z.infer<typeof StartSessionSchema>;
