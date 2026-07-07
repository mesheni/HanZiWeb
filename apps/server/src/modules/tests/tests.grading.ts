import type { TestAnswerResult, TestBreakdownItem, TestQuestion } from '@hanzi/shared';
import { TestAnswerResultSchema, TestBreakdownItemSchema } from '@hanzi/shared';

/**
 * Pure-функции grading'а для тестов (PLAN_Features_v0.3 §6).
 * Вынесены в отдельный модуль, чтобы их можно было тестировать без
 * поднятия Prisma / Redis.
 */

/** Первый тон (1..4) в пиньине, либо 1 по умолчанию. */
export function detectTone(pinyin: string): 1 | 2 | 3 | 4 {
  const map: Record<string, 1 | 2 | 3 | 4> = {
    'ā': 1, 'ē': 1, 'ī': 1, 'ō': 1, 'ū': 1, 'ǖ': 1,
    'á': 2, 'é': 2, 'í': 2, 'ó': 2, 'ú': 2, 'ǘ': 2,
    'ǎ': 3, 'ě': 3, 'ǐ': 3, 'ǒ': 3, 'ǔ': 3, 'ǚ': 3,
    'à': 4, 'è': 4, 'ì': 4, 'ò': 4, 'ù': 4, 'ǜ': 4,
  };
  for (const ch of pinyin) {
    const tone = map[ch];
    if (tone) return tone;
  }
  return 1;
}

/** Нормализация строки пиньиня (lowercase + снятие тонов + схлопывание пробелов). */
export function normalizePinyinAnswer(answer: string): string {
  return answer
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[1-4]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Сравнить ответ пользователя с эталоном. */
export function isAnswerCorrect(question: TestQuestion, userAnswer: string): boolean {
  if (!userAnswer.trim()) return false;

  switch (question.type) {
    case 'multiple-choice-translation':
    case 'reverse-choice-character':
    case 'cloze':
      return userAnswer === question.correctAnswer;

    case 'pinyin-input':
      return normalizePinyinAnswer(userAnswer) === normalizePinyinAnswer(question.correctAnswer);

    case 'tone-recognition':
      return userAnswer.trim() === question.correctAnswer;

    case 'character-assembly':
      return userAnswer === question.correctAnswer;
  }
}

/** Построить один результат ответа (для `TestResult.answers[]`). */
export function gradeAnswer(
  question: TestQuestion,
  userAnswer: string,
): TestAnswerResult {
  return TestAnswerResultSchema.parse({
    questionId: question.id,
    userAnswer,
    correctAnswer: question.correctAnswer,
    isCorrect: isAnswerCorrect(question, userAnswer),
    type: question.type,
    wordId: question.wordId,
    wordCharacter: question.wordCharacter,
    wordPinyin: question.wordPinyin,
    wordTranslation: question.wordTranslation,
  });
}

/** Подсчитать breakdown по типам. */
export function computeBreakdown(
  questions: readonly TestQuestion[],
  results: readonly TestAnswerResult[],
): TestBreakdownItem[] {
  const map = new Map<TestQuestion['type'], { correct: number; total: number }>();
  for (const q of questions) {
    const entry = map.get(q.type) ?? { correct: 0, total: 0 };
    entry.total += 1;
    map.set(q.type, entry);
  }
  for (const r of results) {
    if (!r.isCorrect) continue;
    const entry = map.get(r.type);
    if (entry) entry.correct += 1;
  }
  return [...map.entries()].map(([type, v]) =>
    TestBreakdownItemSchema.parse({ type, correct: v.correct, total: v.total }),
  );
}
