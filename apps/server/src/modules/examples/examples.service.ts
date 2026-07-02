import { prisma } from '../../lib/prisma.js';
import {
  getSentencesWithTranslations,
  getTranslationsForSentence,
  pickRussianTranslation,
} from '../../lib/tatoeba.js';
import type { Prisma } from '@prisma/client';

/** Список примеров для слова. */
export async function listExamples(wordId: string) {
  return prisma.example.findMany({
    where: { wordId },
    orderBy: [{ createdAt: 'asc' }],
  });
}

/** Создание примера вручную. */
export async function createExample(
  wordId: string,
  input: { chinese: string; russian: string },
) {
  // Проверяем, что слово существует (иначе FK упадёт менее информативно).
  const word = await prisma.word.findUnique({ where: { id: wordId }, select: { id: true } });
  if (!word) {
    throw Object.assign(new Error('Word not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  return prisma.example.create({
    data: {
      wordId,
      chinese: input.chinese.trim(),
      russian: input.russian.trim(),
      source: 'manual',
    },
  });
}

/** Удаление примера. */
export async function deleteExample(userId: string, exampleId: string) {
  const example = await prisma.example.findUnique({
    where: { id: exampleId },
    select: { id: true, wordId: true, word: { select: { progress: { where: { userId }, take: 1 } } } },
  });
  if (!example) {
    throw Object.assign(new Error('Example not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  await prisma.example.delete({ where: { id: exampleId } });
  return { deleted: exampleId };
}

/**
 * Стрим-импорт примеров из Tatoeba для слова.
 * `limit` — максимум новых примеров.
 * Идемпотентно: не вставляет дубликаты (по tatoebaId).
 */
export async function fetchExamplesFromTatoeba(
  wordId: string,
  options: { limit?: number } = {},
) {
  const word = await prisma.word.findUnique({
    where: { id: wordId },
    select: { id: true, character: true },
  });
  if (!word) {
    throw Object.assign(new Error('Word not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  const limit = Math.min(Math.max(options.limit ?? 3, 1), 10);

  const sentences = await getSentencesWithTranslations({
    word: word.character,
    lang: 'cmn',
    transLang: 'rus',
    limit: limit * 2,
  });

  let added = 0;
  const created: Array<{ id: string; chinese: string; russian: string }> = [];

  for (const s of sentences) {
    if (added >= limit) break;

    const ru =
      pickRussianTranslation(s, 'rus') ??
      (await fallbackTranslate(s.id, 'rus').catch(() => null));
    if (!ru) continue;

    const exists = await prisma.example.findFirst({ where: { tatoebaId: BigInt(s.id) } });
    if (exists) continue;

    const example = await prisma.example.create({
      data: {
        wordId: word.id,
        chinese: s.text,
        russian: ru.text,
        source: 'tatoeba',
        tatoebaId: BigInt(s.id),
      },
    });
    created.push({ id: example.id, chinese: example.chinese, russian: example.russian });
    added++;
  }

  return { requested: limit, added, items: created };
}

/** Если переводы не пришли в основном запросе, дотягиваем отдельным вызовом. */
async function fallbackTranslate(
  sentenceId: number,
  lang: string,
): Promise<{ text: string } | null> {
  const translations = await getTranslationsForSentence(sentenceId, lang);
  return translations[0] ? { text: translations[0].text } : null;
}

/**
 * Записать cloze-результат и обновить агрегат в `ClozeProgress`.
 * Возвращаемое значение — булева «верно/неверно» и счётчики.
 */
export async function recordClozeAttempt(
  userId: string,
  input: { exampleId: string; correct: boolean },
) {
  const example = await prisma.example.findUnique({
    where: { id: input.exampleId },
    select: { id: true, wordId: true },
  });
  if (!example) {
    throw Object.assign(new Error('Example not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  const data: Prisma.ClozeProgressUncheckedCreateInput = {
    userId,
    wordId: example.wordId,
    exampleId: example.id,
    correctCount: input.correct ? 1 : 0,
    wrongCount: input.correct ? 0 : 1,
    lastSeenAt: new Date(),
    lastCorrect: input.correct,
  };

  const row = await prisma.clozeProgress.upsert({
    where: { userId_exampleId: { userId, exampleId: example.id } },
    create: data,
    update: {
      correctCount: { increment: input.correct ? 1 : 0 },
      wrongCount:   { increment: input.correct ? 0 : 1 },
      lastSeenAt:   new Date(),
      lastCorrect:  input.correct,
    },
  });

  return {
    exampleId: row.exampleId,
    correctCount: row.correctCount,
    wrongCount: row.wrongCount,
    lastCorrect: row.lastCorrect,
  };
}
