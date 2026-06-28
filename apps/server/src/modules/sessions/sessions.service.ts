import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { recalcFsrs } from './srs.js';
import type { StartSession, RecordAnswer } from '@hanzi/shared';

/** Тип прогресса с включённым словом и примерами */
type ProgressWithWord = Prisma.UserWordProgressGetPayload<{
  include: { word: { include: { examples: true } } };
}>;

/**
 * Генерирует новую сессию:
 * - Берёт слова, у которых dueDate <= now() (повтор)
 * - Добирает новые слова (state = NEW) до cardLimit
 */
export async function startSession(userId: string, input: StartSession) {
  const now = new Date();

  // Слова на повтор (dueDate прошёл)
  const dueWords = await prisma.userWordProgress.findMany({
    where: {
      userId,
      dueDate: { lte: now },
      state: { not: 'new' },
    },
    include: {
      word: { include: { examples: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: input.cardLimit,
  });

  // Если не хватает до cardLimit, добавляем новые
  const newWordsNeeded = Math.max(0, input.cardLimit - dueWords.length);
  let newWords: ProgressWithWord[] = [];

  if (newWordsNeeded > 0 && input.includeNew) {
    // Ищем слова, для которых у пользователя нет прогресса
    const existingWordIds = await prisma.userWordProgress.findMany({
      where: { userId },
      select: { wordId: true },
    });
    const excludeIds = existingWordIds.map((p: { wordId: string }) => p.wordId);

    const freshWords = await prisma.word.findMany({
      where: {
        id: { notIn: excludeIds },
        ...(input.deckId ? { deckWords: { some: { deckId: input.deckId } } } : {}),
      },
      include: { examples: true },
      take: newWordsNeeded,
    });

    // Создаём записи прогресса для новых слов
    if (freshWords.length > 0) {
      await prisma.userWordProgress.createMany({
        data: freshWords.map((w: { id: string }) => ({
          userId,
          wordId: w.id,
          state: 'new',
          dueDate: now,
        })),
      });
    }

    newWords = await prisma.userWordProgress.findMany({
      where: {
        userId,
        wordId: { in: freshWords.map((w: { id: string }) => w.id) },
      },
      include: { word: { include: { examples: true } } },
    });
  }

  const allCards = [...dueWords, ...newWords];

  // Создаём сессию
  const deckName = input.deckId
    ? (await prisma.deck.findUnique({ where: { id: input.deckId } }))?.name ?? undefined
    : undefined;

  const session = await prisma.session.create({
    data: {
      userId,
      deckId: input.deckId,
      cardsTotal: allCards.length,
    },
  });

  // Избегаем union type issue — маппим карточки отдельно
  const cards: Array<{ index: number; word: unknown; answered: boolean }> = [
    ...dueWords.map((p, i) => ({ index: i, word: p.word, answered: false })),
    ...newWords.map((p, i) => ({ index: dueWords.length + i, word: p.word, answered: false })),
  ];

  return {
    ...session,
    deckName,
    cards,
  };
}

/**
 * Записывает ответ пользователя и пересчитывает SRS.
 */
export async function recordAnswer(userId: string, input: RecordAnswer) {
  const progress = await prisma.userWordProgress.findUnique({
    where: { userId_wordId: { userId, wordId: input.wordId } },
  });

  if (!progress) {
    throw Object.assign(new Error('Progress not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  // Пересчёт по FSRS
  const { newStability, newDifficulty, newState, intervalDays } = recalcFsrs(
    input.rating,
    progress.stability,
    progress.difficulty,
    progress.state,
  );

  const newDueDate = new Date();
  newDueDate.setDate(newDueDate.getDate() + intervalDays);

  // Обновляем прогресс
  await prisma.userWordProgress.update({
    where: { userId_wordId: { userId, wordId: input.wordId } },
    data: {
      state: newState,
      stability: newStability,
      difficulty: newDifficulty,
      reps: { increment: 1 },
      dueDate: newDueDate,
      lastReviewDate: new Date(),
    },
  });

  // Записываем ответ в сессию
  await prisma.sessionAnswer.create({
    data: {
      sessionId: input.sessionId,
      wordId: input.wordId,
      rating: input.rating,
    },
  });

  // Обновляем прогресс сессии
  await prisma.session.update({
    where: { id: input.sessionId },
    data: { cardsCompleted: { increment: 1 } },
  });

  // Начисляем XP
  const xpGain = { 1: 0, 2: 1, 3: 3, 4: 5 }[input.rating] ?? 0;
  await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: xpGain } },
  });

  return {
    wordId: input.wordId,
    newStability,
    newDifficulty,
    newState,
    newDueDate: newDueDate.toISOString(),
    intervalDays,
    xpGain,
  };
}

export async function getSession(userId: string, sessionId: string) {
  return prisma.session.findFirst({
    where: { id: sessionId, userId },
    include: { answers: true },
  });
}
