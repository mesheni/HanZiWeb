import { z } from 'zod';

/**
 * Тесты по уровням HSK (PLAN_Features_v0.3 §6).
 *
 * Серверная логика (`generateTest`) собирает случайную подборку слов
 * выбранного уровня, генерирует вопросы 6 разных типов, перемешивает
 * их (Fisher–Yates) и возвращает клиенту. Активная сессия живёт в
 * Redis (`test:session:<id>`) до `submitTest` (TTL 2ч), затем
 * финальный результат пишется в `TestResult`.
 */

/** Уровень HSK для теста. */
export const TestLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
export type TestLevel = z.infer<typeof TestLevelSchema>;

/**
 * Тип вопроса в тесте. Соответствует шести режимам практики, расширенным
 * вариантами для иероглифной сборки и cloze-с-выбором.
 *
 * - `multiple-choice-translation` — иероглиф → выбор русского перевода.
 * - `reverse-choice-character`    — перевод → выбор иероглифа.
 * - `pinyin-input`                — набрать пиньинь по иероглифу.
 * - `tone-recognition`            — послушать аудио, выбрать тон 1..4.
 * - `character-assembly`          — собрать слово из иероглифов (с дистракторами).
 * - `cloze`                       — вставить пропущенное слово в предложение.
 */
export const TestQuestionTypeSchema = z.enum([
  'multiple-choice-translation',
  'reverse-choice-character',
  'pinyin-input',
  'tone-recognition',
  'character-assembly',
  'cloze',
]);
export type TestQuestionType = z.infer<typeof TestQuestionTypeSchema>;

/**
 * Один вопрос теста. Поле `correctAnswer` присутствует в ответе клиенту —
 * в PLAN_Features_v0.3 §6 оно явно входит в `TestQuestionSchema`.
 * Это не строгая защита от читерства (клиент технически может подменить),
 * но даёт UI возможность сразу подсвечивать правильный ответ на финальном
 * экране результатов.
 */
export const TestQuestionSchema = z.object({
  id: z.string().uuid(),
  type: TestQuestionTypeSchema,
  /** Слово, к которому относится вопрос. */
  wordId: z.string().uuid(),
  wordCharacter: z.string(),
  wordPinyin: z.string(),
  wordTranslation: z.string(),
  wordHskLevel: z.number().int().min(1).max(9).nullable().default(null),
  wordAudioUrl: z.string().url().nullable().default(null),
  /** Варианты ответа (для multiple-choice / reverse-choice / cloze). */
  options: z.array(z.string()).default([]),
  /** Эталонный ответ для проверки (строка: перевод / иероглиф / пиньинь / тон). */
  correctAnswer: z.string(),
  /** URL аудио слова (для tone-recognition, character-assembly). */
  audioUrl: z.string().url().nullable().default(null),
  /** Предложение с пропуском вместо слова (для cloze). */
  clozeSentence: z.string().nullable().default(null),
  /** Иероглифы-дистракторы (для character-assembly). */
  characterPool: z.array(z.string()).default([]),
});
export type TestQuestion = z.infer<typeof TestQuestionSchema>;

/** Один ответ пользователя (отправляется в `POST /api/tests/:id/submit`). */
export const TestAnswerSchema = z.object({
  questionId: z.string().uuid(),
  /** Что ввёл пользователь (строка — формат зависит от типа вопроса). */
  answer: z.string(),
});
export type TestAnswer = z.infer<typeof TestAnswerSchema>;

/** Активная сессия теста (возвращается `POST /api/tests/start`). */
export const TestSessionSchema = z.object({
  id: z.string().uuid(),
  level: TestLevelSchema,
  questions: z.array(TestQuestionSchema),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
  /** Ответы, накопленные на клиенте. На сервер не отправляются —
   *  grading происходит в `submitTest` по `answers[]`. */
  answers: z.array(TestAnswerSchema).default([]),
  score: z.number().int().nonnegative().default(0),
  percentage: z.number().int().min(0).max(100).default(0),
  timeSpentMs: z.number().int().nonnegative().default(0),
});
export type TestSession = z.infer<typeof TestSessionSchema>;

/** DTO старта нового теста. */
export const StartTestSchema = z.object({
  level: TestLevelSchema,
});
export type StartTest = z.infer<typeof StartTestSchema>;

/** DTO сабмита ответов. */
export const SubmitTestSchema = z.object({
  answers: z.array(TestAnswerSchema).min(1).max(50),
  timeSpentMs: z.number().int().nonnegative(),
});
export type SubmitTest = z.infer<typeof SubmitTestSchema>;

/** Разбор по типу задания в результатах теста. */
export const TestBreakdownItemSchema = z.object({
  type: TestQuestionTypeSchema,
  correct: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type TestBreakdownItem = z.infer<typeof TestBreakdownItemSchema>;

/** Детальный разбор ответа (для экрана ошибок). */
export const TestAnswerResultSchema = z.object({
  questionId: z.string().uuid(),
  userAnswer: z.string(),
  correctAnswer: z.string(),
  isCorrect: z.boolean(),
  type: TestQuestionTypeSchema,
  wordId: z.string().uuid(),
  wordCharacter: z.string(),
  wordPinyin: z.string(),
  wordTranslation: z.string(),
});
export type TestAnswerResult = z.infer<typeof TestAnswerResultSchema>;

/** Результат прохождения теста (хранится в `TestResult`, возвращается `submitTest`). */
export const TestResultSchema = z.object({
  id: z.string().uuid(),
  level: TestLevelSchema,
  totalQuestions: z.number().int().positive(),
  correctAnswers: z.number().int().nonnegative(),
  percentage: z.number().int().min(0).max(100),
  timeSpentMs: z.number().int().nonnegative(),
  breakdown: z.array(TestBreakdownItemSchema),
  /** Полный разбор ответов (правильно/неправильно) — для экрана ошибок. */
  answers: z.array(TestAnswerResultSchema),
  completedAt: z.string().datetime(),
});
export type TestResult = z.infer<typeof TestResultSchema>;

/** Краткая запись результата теста (для списка истории). */
export const TestHistoryItemSchema = TestResultSchema.omit({ answers: true });
export type TestHistoryItem = z.infer<typeof TestHistoryItemSchema>;
