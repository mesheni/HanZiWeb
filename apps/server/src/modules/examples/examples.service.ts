import { prisma } from '../../lib/prisma.js';
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

/**
 * Удаление примера. Авторизация (только ADMIN) — на уровне роута
 * (fix v0.4 §22 follow-up); здесь только существование записи.
 */
export async function deleteExample(exampleId: string) {
  const example = await prisma.example.findUnique({
    where: { id: exampleId },
    select: { id: true },
  });
  if (!example) {
    throw Object.assign(new Error('Example not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  await prisma.example.delete({ where: { id: exampleId } });
  return { deleted: exampleId };
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
