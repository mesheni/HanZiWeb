import { z } from 'zod';

/**
 * Колода (тематический набор слов).
 *
 * Пример:
 *   name: "HSK 1"
 *   description: "Базовая лексика HSK 1 (150 слов)"
 *   isSystemDeck: true
 */
export const DeckSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().nullable().default(null),
  isSystemDeck: z.boolean().default(false),
  wordCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
});

export type Deck = z.infer<typeof DeckSchema>;

/** DTO для создания колоды */
export const CreateDeckSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  isSystemDeck: z.boolean().optional().default(false),
});

export type CreateDeck = z.infer<typeof CreateDeckSchema>;

/** DTO для обновления колоды */
export const UpdateDeckSchema = CreateDeckSchema.partial();
export type UpdateDeck = z.infer<typeof UpdateDeckSchema>;

/** Связь слова с колодой */
export const DeckWordSchema = z.object({
  deckId: z.string().uuid(),
  wordId: z.string().uuid(),
});

export type DeckWord = z.infer<typeof DeckWordSchema>;
