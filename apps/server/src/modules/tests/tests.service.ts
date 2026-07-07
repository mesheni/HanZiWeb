import { randomUUID } from 'node:crypto';
import {
  type StartTest,
  type SubmitTest,
  type TestAnswer,
  type TestAnswerResult,
  type TestBreakdownItem,
  type TestQuestion,
  type TestQuestionType,
  type TestResult,
  type TestSession,
  TestBreakdownItemSchema,
  TestQuestionSchema,
  TestResultSchema,
} from '@hanzi/shared';
import { prisma } from '../../lib/prisma.js';
import { getRedis } from '../../lib/redis.js';
import { computeBreakdown, detectTone, gradeAnswer } from './tests.grading.js';

export { computeBreakdown, detectTone, gradeAnswer, isAnswerCorrect, normalizePinyinAnswer } from './tests.grading.js';

const TEST_SESSION_TTL_SECONDS = 2 * 60 * 60; // 2 часа
const TEST_SESSION_KEY = (id: string): string => `test:session:${id}`;

/** Минимум и максимум слов в тесте. */
const TEST_MIN_QUESTIONS = 20;
const TEST_MAX_QUESTIONS = 30;

/** Кол-во дистракторов для вариантов ответа. */
const OPTIONS_COUNT = 4;
/** Кол-во «лишних» иероглифов в character-assembly. */
const CHARACTER_POOL_EXTRA = 3;

/** Упорядоченный список типов вопросов (для равномерного распределения). */
const QUESTION_TYPES: readonly TestQuestionType[] = [
  'multiple-choice-translation',
  'reverse-choice-character',
  'pinyin-input',
  'tone-recognition',
  'character-assembly',
  'cloze',
];

interface WordRow {
  id: string;
  character: string;
  pinyin: string;
  translation: string;
  hskLevel: number | null;
  audioUrl: string | null;
  examples: { id: string; chinese: string }[];
}

interface TestSessionRecord {
  id: string;
  userId: string;
  level: number;
  questions: TestQuestion[];
  startedAt: string;
}

/** Fisher–Yates shuffle (in-place, возвращает новый массив). */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/** Выбрать N уникальных элементов из `pool`, исключая `exclude`. */
function pickNUnique<T>(pool: readonly T[], exclude: ReadonlySet<unknown>, n: number): T[] {
  const filtered = pool.filter((x) => !exclude.has(x));
  return shuffle(filtered).slice(0, n);
}

/** Собрать иероглифы-дистракторы из других слов уровня. */
function buildCharacterPool(target: WordRow, pool: readonly WordRow[]): string[] {
  const seen = new Set<string>([target.character]);
  const candidates: string[] = [];
  for (const w of pool) {
    if (w.id === target.id) continue;
    for (const ch of w.character) {
      if (!seen.has(ch)) {
        seen.add(ch);
        candidates.push(ch);
      }
    }
  }
  return shuffle(candidates).slice(0, CHARACTER_POOL_EXTRA);
}

/** Найти в примерах предложение, содержащее иероглиф целиком. */
function findClozeExample(word: WordRow): { exampleId: string; clozeSentence: string } | null {
  for (const ex of word.examples) {
    if (ex.chinese.includes(word.character)) {
      const clozeSentence = ex.chinese.replace(word.character, '____');
      return { exampleId: ex.id, clozeSentence };
    }
  }
  return null;
}

/** Сгенерировать один вопрос по типу. Если тип неприменим (например, нет примера для cloze),
 *  вернёт null — caller должен пропустить или подменить. */
function buildQuestion(
  type: TestQuestionType,
  word: WordRow,
  pool: readonly WordRow[],
): TestQuestion | null {
  const others = pool.filter((w) => w.id !== word.id);
  const id = randomUUID();

  switch (type) {
    case 'multiple-choice-translation': {
      const distractors = pickNUnique(
        others.map((w) => w.translation),
        new Set([word.translation]),
        OPTIONS_COUNT - 1,
      );
      if (distractors.length < OPTIONS_COUNT - 1) return null;
      return TestQuestionSchema.parse({
        id,
        type,
        wordId: word.id,
        wordCharacter: word.character,
        wordPinyin: word.pinyin,
        wordTranslation: word.translation,
        wordHskLevel: word.hskLevel,
        wordAudioUrl: word.audioUrl,
        options: shuffle([word.translation, ...distractors]),
        correctAnswer: word.translation,
      });
    }

    case 'reverse-choice-character': {
      const distractors = pickNUnique(
        others.map((w) => w.character),
        new Set([word.character]),
        OPTIONS_COUNT - 1,
      );
      if (distractors.length < OPTIONS_COUNT - 1) return null;
      return TestQuestionSchema.parse({
        id,
        type,
        wordId: word.id,
        wordCharacter: word.character,
        wordPinyin: word.pinyin,
        wordTranslation: word.translation,
        wordHskLevel: word.hskLevel,
        wordAudioUrl: word.audioUrl,
        options: shuffle([word.character, ...distractors]),
        correctAnswer: word.character,
      });
    }

    case 'pinyin-input': {
      return TestQuestionSchema.parse({
        id,
        type,
        wordId: word.id,
        wordCharacter: word.character,
        wordPinyin: word.pinyin,
        wordTranslation: word.translation,
        wordHskLevel: word.hskLevel,
        wordAudioUrl: word.audioUrl,
        correctAnswer: word.pinyin,
      });
    }

    case 'tone-recognition': {
      return TestQuestionSchema.parse({
        id,
        type,
        wordId: word.id,
        wordCharacter: word.character,
        wordPinyin: word.pinyin,
        wordTranslation: word.translation,
        wordHskLevel: word.hskLevel,
        wordAudioUrl: word.audioUrl,
        audioUrl: word.audioUrl,
        correctAnswer: String(detectTone(word.pinyin)),
      });
    }

    case 'character-assembly': {
      const distractorChars = buildCharacterPool(word, pool);
      if (distractorChars.length === 0) return null;
      return TestQuestionSchema.parse({
        id,
        type,
        wordId: word.id,
        wordCharacter: word.character,
        wordPinyin: word.pinyin,
        wordTranslation: word.translation,
        wordHskLevel: word.hskLevel,
        wordAudioUrl: word.audioUrl,
        characterPool: shuffle([...word.character, ...distractorChars]),
        correctAnswer: word.character,
      });
    }

    case 'cloze': {
      const cloze = findClozeExample(word);
      if (!cloze) return null;
      const distractors = pickNUnique(
        others.map((w) => w.character),
        new Set([word.character]),
        OPTIONS_COUNT - 1,
      );
      if (distractors.length < OPTIONS_COUNT - 1) return null;
      return TestQuestionSchema.parse({
        id,
        type,
        wordId: word.id,
        wordCharacter: word.character,
        wordPinyin: word.pinyin,
        wordTranslation: word.translation,
        wordHskLevel: word.hskLevel,
        wordAudioUrl: word.audioUrl,
        clozeSentence: cloze.clozeSentence,
        options: shuffle([word.character, ...distractors]),
        correctAnswer: word.character,
      });
    }
  }
}

/** Сгенерировать набор вопросов, равномерно распределённых по типам.
 *  Слов с примерами не хватает — заменяем на `pinyin-input` (всегда применим). */
function buildQuestions(words: readonly WordRow[]): TestQuestion[] {
  const result: TestQuestion[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const primaryType = QUESTION_TYPES[i % QUESTION_TYPES.length]!;
    const fallbackTypes: TestQuestionType[] = [
      'pinyin-input',
      'multiple-choice-translation',
      'reverse-choice-character',
    ];

    let question: TestQuestion | null = buildQuestion(primaryType, word, words);
    if (!question) {
      for (const t of fallbackTypes) {
        if (t === primaryType) continue;
        question = buildQuestion(t, word, words);
        if (question) break;
      }
    }
    if (question) result.push(question);
  }
  return result;
}

/** Записать сессию в Redis и вернуть TestSession для клиента. */
async function persistSession(record: TestSessionRecord): Promise<TestSession> {
  const redis = getRedis();
  await redis.setex(
    TEST_SESSION_KEY(record.id),
    TEST_SESSION_TTL_SECONDS,
    JSON.stringify(record),
  );
  return {
    id: record.id,
    level: record.level as 1 | 2 | 3 | 4 | 5 | 6,
    questions: record.questions,
    startedAt: record.startedAt,
    completedAt: null,
    answers: [],
    score: 0,
    percentage: 0,
    timeSpentMs: 0,
  };
}

/** Достать сессию из Redis. Кидает 404 если нет / истекла / не принадлежит пользователю. */
export async function loadTestSession(testId: string, userId: string): Promise<TestSessionRecord> {
  const redis = getRedis();
  const raw = await redis.get(TEST_SESSION_KEY(testId));
  if (!raw) {
    throw Object.assign(new Error('Test session not found or expired'), {
      statusCode: 404,
      code: 'TEST_SESSION_NOT_FOUND',
    });
  }
  const record = JSON.parse(raw) as TestSessionRecord;
  if (record.userId !== userId) {
    throw Object.assign(new Error('Test session does not belong to user'), {
      statusCode: 403,
      code: 'TEST_SESSION_FORBIDDEN',
    });
  }
  return record;
}

/** Удалить сессию из Redis (после submit). */
async function deleteTestSession(testId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(TEST_SESSION_KEY(testId));
}

/**
 * Сгенерировать новый тест выбранного уровня HSK.
 * Берёт случайные слова уровня, формирует вопросы 6 типов,
 * перемешивает и сохраняет в Redis.
 */
export async function generateTest(userId: string, input: StartTest): Promise<TestSession> {
  const allWords = await prisma.word.findMany({
    where: { hskLevel: input.level },
    select: {
      id: true,
      character: true,
      pinyin: true,
      translation: true,
      hskLevel: true,
      audioUrl: true,
      examples: { select: { id: true, chinese: true } },
    },
  });

  if (allWords.length < 4) {
    throw Object.assign(
      new Error(`HSK ${input.level}: недостаточно слов для генерации теста`),
      { statusCode: 400, code: 'INSUFFICIENT_WORDS' },
    );
  }

  const targetCount = Math.min(TEST_MAX_QUESTIONS, Math.max(TEST_MIN_QUESTIONS, allWords.length));
  const selected = shuffle(allWords).slice(0, targetCount);
  const questions = buildQuestions(selected);

  if (questions.length < 4) {
    throw Object.assign(
      new Error(`HSK ${input.level}: не удалось собрать минимальный тест (вопросов: ${questions.length})`),
      { statusCode: 400, code: 'INSUFFICIENT_QUESTIONS' },
    );
  }

  return persistSession({
    id: randomUUID(),
    userId,
    level: input.level,
    questions: shuffle(questions),
    startedAt: new Date().toISOString(),
  });
}

/** Сабмит ответов: проверка, расчёт, запись TestResult. */
export async function submitTest(
  userId: string,
  testId: string,
  input: SubmitTest,
): Promise<TestResult> {
  const session = await loadTestSession(testId, userId);

  const answersById = new Map<string, TestAnswer>(
    input.answers.map((a) => [a.questionId, a]),
  );

  const results: TestAnswerResult[] = session.questions.map((q) => {
    const userAnswer = answersById.get(q.id)?.answer ?? '';
    return gradeAnswer(q, userAnswer);
  });

  const correctAnswers = results.filter((r) => r.isCorrect).length;
  const total = session.questions.length;
  const percentage = total === 0 ? 0 : Math.round((correctAnswers / total) * 100);
  const breakdown = computeBreakdown(session.questions, results);

  const saved = await prisma.testResult.create({
    data: {
      userId,
      level: session.level,
      totalQuestions: total,
      correctAnswers,
      percentage,
      timeSpentMs: input.timeSpentMs,
      breakdown: JSON.stringify(breakdown),
    },
  });

  // Сессия больше не нужна.
  await deleteTestSession(testId);

  return TestResultSchema.parse({
    id: saved.id,
    level: saved.level as 1 | 2 | 3 | 4 | 5 | 6,
    totalQuestions: saved.totalQuestions,
    correctAnswers: saved.correctAnswers,
    percentage: saved.percentage,
    timeSpentMs: saved.timeSpentMs,
    breakdown,
    answers: results,
    completedAt: saved.completedAt.toISOString(),
  });
}

/** Список последних результатов тестов пользователя (без деталей ответов). */
export async function getHistory(userId: string, limit: number): Promise<TestResult[]> {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const rows = await prisma.testResult.findMany({
    where: { userId },
    orderBy: { completedAt: 'desc' },
    take: safeLimit,
  });

  return rows.map((r) => {
    let breakdown: TestBreakdownItem[] = [];
    try {
      const parsed = JSON.parse(r.breakdown);
      breakdown = Array.isArray(parsed) ? parsed.map((b) => TestBreakdownItemSchema.parse(b)) : [];
    } catch {
      breakdown = [];
    }
    return TestResultSchema.parse({
      id: r.id,
      level: r.level as 1 | 2 | 3 | 4 | 5 | 6,
      totalQuestions: r.totalQuestions,
      correctAnswers: r.correctAnswers,
      percentage: r.percentage,
      timeSpentMs: r.timeSpentMs,
      breakdown,
      // Список ответов в историю не включаем — для этого есть GET /:id.
      answers: [],
      completedAt: r.completedAt.toISOString(),
    });
  });
}
