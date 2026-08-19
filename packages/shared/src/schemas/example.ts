import { z } from 'zod';

/** Один пример предложения для слова. */
export const ExampleSchema = z.object({
  id: z.string().uuid(),
  wordId: z.string().uuid(),
  chinese: z.string(),
  /** Пиньинь предложения (датасет hsk_audio). */
  pinyin: z.string().nullable().default(null),
  russian: z.string(),
  /** Откуда пример: hsk_audio | manual. */
  source: z.string().default('manual'),
  /** Уровень HSK предложения (1..6). */
  hskLevel: z.number().int().nullable().default(null),
  /** Аудио носителя: обычная скорость. */
  audioUrl: z.string().nullable().default(null),
  /** Аудио носителя: замедленная скорость. */
  audioSlowUrl: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
});
export type Example = z.infer<typeof ExampleSchema>;

/** DTO для ручного создания примера. */
export const CreateExampleSchema = z.object({
  chinese: z.string().min(1).max(200),
  russian: z.string().min(1).max(400),
});
export type CreateExample = z.infer<typeof CreateExampleSchema>;

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
