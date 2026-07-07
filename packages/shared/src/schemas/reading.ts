import { z } from 'zod';
import { WordStateSchema } from './progress.js';

export const ReadingTextListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  hskLevel: z.number().int().min(1).max(6),
  wordCount: z.number().int().nonnegative(),
  knownWordsCount: z.number().int().nonnegative(),
  author: z.string().nullable(),
  source: z.string().nullable(),
  readAt: z.string().datetime().nullable(),
});
export type ReadingTextListItem = z.infer<typeof ReadingTextListItemSchema>;

export const ReadingTokenWordSchema = z.object({
  id: z.string().uuid().nullable(),
  character: z.string(),
  pinyin: z.string(),
  translation: z.string(),
  hskLevel: z.number().int().min(1).max(9).nullable(),
  audioUrl: z.string().url().nullable(),
});
export type ReadingTokenWord = z.infer<typeof ReadingTokenWordSchema>;

export const ReadingTokenSchema = z.object({
  position: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  surface: z.string(),
  word: ReadingTokenWordSchema.nullable(),
  state: WordStateSchema.nullable(),
  isPriority: z.boolean().default(false),
});
export type ReadingToken = z.infer<typeof ReadingTokenSchema>;

export const ReadingTextDetailSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  hskLevel: z.number().int().min(1).max(6),
  author: z.string().nullable(),
  source: z.string().nullable(),
  wordCount: z.number().int().nonnegative(),
  paragraphs: z.array(z.string()),
  tokens: z.array(ReadingTokenSchema),
  readAt: z.string().datetime().nullable(),
});
export type ReadingTextDetail = z.infer<typeof ReadingTextDetailSchema>;

export const AddPriorityWordsSchema = z.object({
  wordIds: z.array(z.string().uuid()).min(1).max(100),
});
export type AddPriorityWords = z.infer<typeof AddPriorityWordsSchema>;
