import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { recalcFsrs } from './srs.js';
import * as achievementsService from '../achievements/achievements.service.js';
import type { StartSession, RecordAnswer, UserAchievement } from '@hanzi/shared';

/** Тип прогресса с включённым словом и примерами */
type ProgressWithWord = Prisma.UserWordProgressGetPayload<{
  include: { word: { include: { examples: true } } };
}>;

const HSK_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const HSK_LEVEL_LIST = [...HSK_LEVELS];

async function getUnlockedHskLevel(userId: string): Promise<number | null> {
  for (const level of HSK_LEVELS) {
    const total = await prisma.word.count({ where: { hskLevel: level } });
    if (total === 0) continue;

    const mastered = await prisma.userWordProgress.count({
      where: {
        userId,
        state: 'graduated',
        word: { is: { hskLevel: level } },
      },
    });

    if (mastered < total) {
      return level;
    }
  }

  return null;
}

function orderCards(cards: ProgressWithWord[]): ProgressWithWord[] {
  return [...cards].sort((a, b) => {
    const aLevel = a.word.hskLevel ?? Number.POSITIVE_INFINITY;
    const bLevel = b.word.hskLevel ?? Number.POSITIVE_INFINITY;
    if (aLevel !== bLevel) return aLevel - bLevel;

    const aCreated = new Date(a.word.createdAt).getTime();
    const bCreated = new Date(b.word.createdAt).getTime();
    return aCreated - bCreated;
  });
}

/**
 * Генерирует новую сессию:
 * - Берёт слова, у которых dueDate <= now() (повтор)
 * - Добирает новые слова (state = NEW) до cardLimit
 */
export async function startSession(userId: string, input: StartSession) {
  const now = new Date();
  const mode = input.mode ?? 'mixed';
  const unlockedLevel = input.deckId ? null : await getUnlockedHskLevel(userId);

  const deckWhere: Prisma.WordWhereInput = input.deckId
    ? { deckWords: { some: { deckId: input.deckId } } }
    : unlockedLevel
      ? { hskLevel: unlockedLevel }
      : { hskLevel: { in: HSK_LEVEL_LIST } };

  const dueWords: ProgressWithWord[] =
    mode === 'learn'
      ? []
      : ((await prisma.userWordProgress.findMany({
          where: {
            userId,
            dueDate: { lte: now },
            state: { not: 'new' },
            ...(input.deckId ? { word: { is: deckWhere } } : {}),
          },
          include: {
            word: { include: { examples: true } },
          },
          orderBy: [
            { dueDate: 'asc' },
            { word: { hskLevel: 'asc' } },
            { word: { createdAt: 'asc' } },
          ],
          take: input.cardLimit,
        })) as ProgressWithWord[]);

  // Если нужен микс или режим только новых слов, подбираем fresh words.
  const newWordsNeeded =
    mode === 'review'
      ? 0
      : mode === 'learn'
        ? input.cardLimit
        : Math.max(0, input.cardLimit - dueWords.length);
  let newWords: ProgressWithWord[] = [];

  if (newWordsNeeded > 0 && (input.includeNew || mode === 'learn')) {
    // Ищем слова, для которых у пользователя нет прогресса
    const existingWordIds = await prisma.userWordProgress.findMany({
      where: { userId },
      select: { wordId: true },
    });
    const excludeIds = existingWordIds.map((p: { wordId: string }) => p.wordId);

    const freshWords = await prisma.word.findMany({
      where: {
        id: { notIn: excludeIds },
        ...deckWhere,
      },
      include: { examples: true },
      orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
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

    newWords = (await prisma.userWordProgress.findMany({
      where: {
        userId,
        wordId: { in: freshWords.map((w: { id: string }) => w.id) },
      },
      include: { word: { include: { examples: true } } },
      orderBy: [{ word: { hskLevel: 'asc' } }, { word: { createdAt: 'asc' } }],
    })) as ProgressWithWord[];
  }

  const allCards = orderCards([...dueWords, ...newWords]);

  // Создаём сессию
  const deckName = input.deckId
    ? (await prisma.deck.findUnique({ where: { id: input.deckId } }))?.name ?? undefined
    : undefined;

  const session = await prisma.session.create({
    data: {
      userId,
      deckId: input.deckId,
      cardsTotal: allCards.length,
      mode,
      practiceType: input.practiceType ?? 'flip-card',
    },
  });

  // Избегаем union type issue — маппим карточки отдельно
  const cards: Array<{ index: number; word: unknown; answered: boolean; state: string }> = [
    ...dueWords.map((p, i) => ({ index: i, word: p.word, answered: false, state: p.state })),
    ...newWords.map((p, i) => ({ index: dueWords.length + i, word: p.word, answered: false, state: p.state })),
  ];

  return {
    ...session,
    deckName,
    cards,
  };
}

/**
 * Записывает ответ пользователя и пересчитывает SRS.
 *
 * После записи ответа проверяет условия достижений (см.
 * `apps/server/src/modules/achievements`) и возвращает список
 * только что разблокированных в `unlockedAchievements`. Клиент
 * показывает их через toast (`useToast`).
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

  // Проверка достижений (глобальные + идеальная сессия).
  // Делается после всех мутаций, чтобы checkPerfectSession
  // видел уже записанный ответ. Не блокирует ответ: даже при
  // ошибке пользователь получит корректный SRS-результат.
  let unlockedAchievements: UserAchievement[] = [];
  try {
    unlockedAchievements = await achievementsService.checkAllAchievements(
      userId,
      input.sessionId,
    );
  } catch (err) {
    // Достижения не должны ломать основной поток
    console.error('checkAllAchievements failed', err);
  }

  return {
    wordId: input.wordId,
    newStability,
    newDifficulty,
    newState,
    newDueDate: newDueDate.toISOString(),
    intervalDays,
    xpGain,
    unlockedAchievements,
  };
}

export async function getSession(userId: string, sessionId: string) {
  return prisma.session.findFirst({
    where: { id: sessionId, userId },
    include: { answers: true },
  });
}

/**
 * Возвращает случайные слова из словаря (используется для генерации
 * дистракторов в multiple-choice / reverse-choice практиках).
 */
export async function getRandomWords(
  excludeIds: string[],
  count: number,
  hskLevel?: number | null,
) {
  const where: Prisma.WordWhereInput = {
    id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
  };
  if (hskLevel != null) {
    where.hskLevel = hskLevel;
  }

  const total = await prisma.word.count({ where });
  if (total === 0) return [];

  const skip = Math.max(0, Math.floor(Math.random() * Math.max(0, total - count)));
  return prisma.word.findMany({
    where,
    include: { examples: true },
    orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
    skip,
    take: count,
  });
}
