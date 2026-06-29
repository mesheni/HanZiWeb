import { z } from 'zod';

/**
 * Слово (иероглиф) в словаре.
 *
 * Пример:
 *   character: "喜欢"
 *   pinyin: "xǐ huān"
 *   translation: "нравиться, любить"
 *   hskLevel: 1
 *   mnemonic: "女 (девушка) + 子 (ребёнок) → нравится"
 */
export const WordSchema = z.object({
  id: z.string().uuid(),
  character: z.string().min(1).max(16),
  pinyin: z.string().min(1),
  translation: z.string().min(1),
  hskLevel: z.number().int().min(1).max(9).nullable().default(null),
  audioUrl: z.string().url().nullable().default(null),
  mnemonic: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
  /** Примеры использования — вложенный массив */
  examples: z
    .array(
      z.object({
        id: z.string().uuid(),
        chinese: z.string(),
        russian: z.string(),
      }),
    )
    .default([]),
});

export type Word = z.infer<typeof WordSchema>;

/** DTO для создания слова */
export const CreateWordSchema = z.object({
  character: z.string().min(1).max(16),
  pinyin: z.string().min(1),
  translation: z.string().min(1),
  hskLevel: z.number().int().min(1).max(9).optional(),
  audioUrl: z.string().url().optional(),
  mnemonic: z.string().optional(),
  examples: z
    .array(
      z.object({
        chinese: z.string(),
        russian: z.string(),
      }),
    )
    .optional(),
});

export type CreateWord = z.infer<typeof CreateWordSchema>;

/** DTO для обновления слова */
export const UpdateWordSchema = CreateWordSchema.partial();
export type UpdateWord = z.infer<typeof UpdateWordSchema>;

/** DTO слова в «плоском» виде для списков */
export const WordListItemSchema = z.object({
  id: z.string().uuid(),
  character: z.string(),
  pinyin: z.string(),
  translation: z.string(),
  hskLevel: z.number().int().min(1).max(9).nullable(),
  status: z.enum(['new', 'learning', 'review', 'graduated']).optional(),
});

export type WordListItem = z.infer<typeof WordListItemSchema>;

/** Фильтры для запроса списка слов */
export const WordFiltersSchema = z.object({
  search: z.string().optional(),
  hskLevel: z.coerce.number().int().min(1).max(9).optional(),
  deckId: z.string().uuid().optional(),
  status: z.enum(['new', 'learning', 'review', 'graduated']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type WordFilters = z.infer<typeof WordFiltersSchema>;
