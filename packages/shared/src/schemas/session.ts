import { z } from 'zod';
import { SrsRatingSchema } from './progress.js';
import { WordSchema } from './word.js';

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
});

export type SessionCard = z.infer<typeof SessionCardSchema>;

/** Полная сессия с карточками */
export const FullSessionSchema = SessionSchema.extend({
  cards: z.array(SessionCardSchema),
});

export type FullSession = z.infer<typeof FullSessionSchema>;

/** DTO для старта новой сессии */
export const StartSessionSchema = z.object({
  deckId: z.string().uuid().optional(),
  /** Сколько карточек (max). По умолчанию 20. */
  cardLimit: z.number().int().min(1).max(50).default(20),
  /** Добавлять ли новые слова в микс (true = микс новых + повтор) */
  includeNew: z.boolean().default(true),
});

export type StartSession = z.infer<typeof StartSessionSchema>;
