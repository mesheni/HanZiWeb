import { z } from 'zod';

/**
 * Тег для слова.
 *
 * Используется для фильтрации сессий (`tags[]` в `StartSessionSchema`).
 * Примеры семантики: «с трудным тоном», «часто путаю», «для HSK 3».
 *
 * @example
 *   { id: "...", name: "С трудным тоном", slug: "hard-tones", color: "FFB74D" }
 */
export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  /** Уникальный URL-slug, латиница + дефисы. */
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
  /** Цвет без # (например "FFB74D"). */
  color: z
    .string()
    .regex(/^[0-9A-Fa-f]{6}$/, 'color must be 6 hex chars without #')
    .nullable()
    .default(null),
  createdAt: z.string().datetime(),
});

export type Tag = z.infer<typeof TagSchema>;

/** DTO для создания тега. */
export const CreateTagSchema = z.object({
  name: z.string().min(1).max(50),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
  color: z
    .string()
    .regex(/^[0-9A-Fa-f]{6}$/)
    .optional(),
});

export type CreateTag = z.infer<typeof CreateTagSchema>;

/** DTO для установки тегов слова (replace). */
export const SetWordTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).max(20),
});

export type SetWordTags = z.infer<typeof SetWordTagsSchema>;
