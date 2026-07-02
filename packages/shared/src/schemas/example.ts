import { z } from 'zod';

/** Один пример предложения для слова. */
export const ExampleSchema = z.object({
  id: z.string().uuid(),
  wordId: z.string().uuid(),
  chinese: z.string(),
  russian: z.string(),
  source: z.string().default('manual'),
  tatoebaId: z.number().int().nullable().default(null),
  createdAt: z.string().datetime(),
});
export type Example = z.infer<typeof ExampleSchema>;

/** DTO для ручного создания примера. */
export const CreateExampleSchema = z.object({
  chinese: z.string().min(1).max(200),
  russian: z.string().min(1).max(400),
});
export type CreateExample = z.infer<typeof CreateExampleSchema>;

/** Query-параметр выборки примеров из Tatoeba. */
export const FetchExamplesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(3),
});
export type FetchExamplesQuery = z.infer<typeof FetchExamplesQuerySchema>;

/** DTO ответа на fetch — что нового добавили. */
export const FetchExamplesResultSchema = z.object({
  requested: z.number().int(),
  added: z.number().int(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      chinese: z.string(),
      russian: z.string(),
    }),
  ),
});
export type FetchExamplesResult = z.infer<typeof FetchExamplesResultSchema>;

/** Запись попытки cloze. */
export const RecordClozeSchema = z.object({
  exampleId: z.string().uuid(),
  correct: z.boolean(),
});
export type RecordCloze = z.infer<typeof RecordClozeSchema>;

/** Ответ на cloze-вопрос: какое слово в примере надо вставить и где. */
export const ClozeQuestionSchema = z.object({
  exampleId: z.string().uuid(),
  /** Исходное предложение (с вставленным словом). */
  sentence: z.string(),
  /** Предложение с пропуском (заменено маркером «____»). */
  clozeSentence: z.string(),
  /** Слово, которое нужно вставить (иероглифами). */
  answer: z.string(),
  /** Русский перевод — подсказка при неверном ответе. */
  hint: z.string(),
});
export type ClozeQuestion = z.infer<typeof ClozeQuestionSchema>;
