import { z } from 'zod';

/**
 * Колода (тематический набор слов).
 *
 * Системные колоды (HSK) имеют `isSystemDeck=true` и `ownerId=null`.
 * Кастомные колоды создаются пользователем: `isSystemDeck=false`,
 * `ownerId=<userUuid>`.
 */
export const DeckSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().nullable().default(null),
  isSystemDeck: z.boolean().default(false),
  /** Владелец кастомной колоды. null для системных. */
  ownerId: z.string().uuid().nullable().default(null),
  /** Короткий код для шеринга. null если колода не расшарена. */
  shareCode: z.string().nullable().default(null),
  wordCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Deck = z.infer<typeof DeckSchema>;

/** DTO для создания кастомной колоды */
export const CreateDeckSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  /** Идентификаторы слов, которые войдут в колоду. */
  wordIds: z.array(z.string().uuid()).min(0).max(500).default([]),
});

export type CreateDeck = z.infer<typeof CreateDeckSchema>;

/** DTO для обновления кастомной колоды (все поля опциональны) */
export const UpdateDeckSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  /** Полный список идентификаторов слов (заменяет предыдущий набор). */
  wordIds: z.array(z.string().uuid()).max(500).optional(),
});

export type UpdateDeck = z.infer<typeof UpdateDeckSchema>;

/** DTO кастомной колоды с текущим набором слов (для конструктора) */
export const DeckWithWordsSchema = DeckSchema.extend({
  wordIds: z.array(z.string().uuid()).default([]),
});

export type DeckWithWords = z.infer<typeof DeckWithWordsSchema>;

/** Ответ share-эндпоинта */
export const ShareDeckSchema = z.object({
  shareCode: z.string(),
});

export type ShareDeck = z.infer<typeof ShareDeckSchema>;

/** Ответ subscribe-эндпоинта */
export const SubscribeResultSchema = z.object({
  deck: DeckSchema,
  wordsAdded: z.number().int().nonnegative(),
});

export type SubscribeResult = z.infer<typeof SubscribeResultSchema>;

/** Связь слова с колодой */
export const DeckWordSchema = z.object({
  deckId: z.string().uuid(),
  wordId: z.string().uuid(),
});

export type DeckWord = z.infer<typeof DeckWordSchema>;
