import { prisma } from '../../lib/prisma.js';
import { generateShareCode } from '../../lib/shareCode.js';
import type { Prisma } from '@prisma/client';

/**
 * Сериализация Deck в DTO для API.
 */
function toDeckDto(deck: {
  id: string;
  name: string;
  description: string | null;
  isSystemDeck: boolean;
  ownerId: string | null;
  shareCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { words: number };
}) {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    isSystemDeck: deck.isSystemDeck,
    ownerId: deck.ownerId,
    shareCode: deck.shareCode,
    wordCount: deck._count?.words ?? 0,
    createdAt: deck.createdAt.toISOString(),
    updatedAt: deck.updatedAt.toISOString(),
  };
}

/**
 * Список колод, доступных пользователю: все системные (HSK) + свои кастомные.
 * Чужие приватные колоды не отдаются — это «isSystemDeck || ownerId === userId».
 * Сортировка: сначала системные, потом кастомные (свежие сверху).
 * PLAN_Features_v0.4 §23.
 */
export async function listDecksForUser(userId: string) {
  const decks = await prisma.deck.findMany({
    where: { OR: [{ isSystemDeck: true }, { ownerId: userId }] },
    include: { _count: { select: { words: true } } },
    orderBy: [{ isSystemDeck: 'desc' }, { createdAt: 'desc' }],
  });
  return decks.map(toDeckDto);
}

/**
 * Список только кастомных колод конкретного пользователя.
 * Используется в профиле/конструкторе — без системных.
 */
export async function listUserDecks(userId: string) {
  const decks = await prisma.deck.findMany({
    where: { ownerId: userId },
    include: { _count: { select: { words: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return decks.map(toDeckDto);
}

/**
 * Загружает колоду с проверкой доступа. Возвращает deck или null.
 * null — если колоды нет ИЛИ она приватная и принадлежит другому
 * юзеру. Намеренно «404-shaped» (а не 403) — чтобы не утекать
 * существование чужой приватной колоды. PLAN_Features_v0.4 §23.
 */
async function loadDeckForUser(deckId: string, userId: string) {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: {
      words: { select: { wordId: true }, orderBy: { wordId: 'asc' } },
      _count: { select: { words: true } },
    },
  });
  if (!deck) return null;
  if (!deck.isSystemDeck && deck.ownerId !== userId) return null;
  return deck;
}

/**
 * Получить колоду с полным списком wordIds (используется конструктором).
 * Доступ: системная — всем, кастомная — только владельцу.
 * В ответе — `wordIds[]`, отсортированные по `wordId`.
 */
export async function getDeckWithWordsForUser(id: string, userId: string) {
  const deck = await loadDeckForUser(id, userId);
  if (!deck) return null;
  return {
    ...toDeckDto(deck),
    wordIds: deck.words.map((w) => w.wordId),
  };
}

/**
 * Создание кастомной колоды пользователем.
 * Проверяет, что все переданные wordIds реально существуют
 * (иначе FK упадёт менее информативно).
 */
export async function createCustomDeck(
  userId: string,
  input: { name: string; description?: string; wordIds?: string[] },
) {
  const wordIds = input.wordIds ?? [];

  if (wordIds.length > 0) {
    const found = await prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: { id: true },
    });
    if (found.length !== wordIds.length) {
      throw Object.assign(new Error('Some words not found'), {
        statusCode: 400,
        code: 'INVALID_WORDS',
      });
    }
  }

  const deck = await prisma.deck.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      isSystemDeck: false,
      ownerId: userId,
      words: {
        create: wordIds.map((wordId) => ({ wordId })),
      },
    },
    include: { _count: { select: { words: true } } },
  });

  return toDeckDto(deck);
}

/**
 * Обновление кастомной колоды. Только владелец.
 * Если переданы `wordIds` — заменяет набор слов целиком.
 */
export async function updateCustomDeck(
  userId: string,
  deckId: string,
  input: { name?: string; description?: string | null; wordIds?: string[] },
) {
  const existing = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { ownerId: true, isSystemDeck: true },
  });
  if (!existing) {
    throw Object.assign(new Error('Deck not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  if (existing.isSystemDeck) {
    throw Object.assign(new Error('System decks cannot be edited'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }
  if (existing.ownerId !== userId) {
    throw Object.assign(new Error('Not the deck owner'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  if (input.wordIds && input.wordIds.length > 0) {
    const found = await prisma.word.findMany({
      where: { id: { in: input.wordIds } },
      select: { id: true },
    });
    if (found.length !== input.wordIds.length) {
      throw Object.assign(new Error('Some words not found'), {
        statusCode: 400,
        code: 'INVALID_WORDS',
      });
    }
  }

  const updateData: Prisma.DeckUpdateInput = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
  };

  return prisma.$transaction(async (tx) => {
    const deck = await tx.deck.update({
      where: { id: deckId },
      data: updateData,
    });

    if (input.wordIds) {
      await tx.deckWord.deleteMany({ where: { deckId } });
      if (input.wordIds.length > 0) {
        await tx.deckWord.createMany({
          data: input.wordIds.map((wordId) => ({ deckId, wordId })),
          skipDuplicates: true,
        });
      }
    }

    const wordCount = await tx.deckWord.count({ where: { deckId } });
    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      isSystemDeck: deck.isSystemDeck,
      ownerId: deck.ownerId,
      shareCode: deck.shareCode,
      wordCount,
      createdAt: deck.createdAt.toISOString(),
      updatedAt: deck.updatedAt.toISOString(),
    };
  });
}

/**
 * Удаление кастомной колоды. Только владелец.
 */
export async function deleteCustomDeck(userId: string, deckId: string) {
  const existing = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { ownerId: true, isSystemDeck: true },
  });
  if (!existing) {
    throw Object.assign(new Error('Deck not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  if (existing.isSystemDeck) {
    throw Object.assign(new Error('System decks cannot be deleted'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }
  if (existing.ownerId !== userId) {
    throw Object.assign(new Error('Not the deck owner'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  await prisma.deck.delete({ where: { id: deckId } });
  return { deleted: deckId };
}

/**
 * Генерация/обновление короткого кода для шеринга кастомной колоды.
 * Колода должна быть кастомной и принадлежать пользователю.
 */
export async function shareDeck(userId: string, deckId: string) {
  const existing = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { ownerId: true, isSystemDeck: true, shareCode: true },
  });
  if (!existing) {
    throw Object.assign(new Error('Deck not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  if (existing.isSystemDeck) {
    throw Object.assign(new Error('System decks cannot be shared'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }
  if (existing.ownerId !== userId) {
    throw Object.assign(new Error('Not the deck owner'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  if (existing.shareCode) {
    return { shareCode: existing.shareCode };
  }

  // Пытаемся сгенерировать уникальный код; если коллизия — пробуем ещё.
  const MAX_ATTEMPTS = 8;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = generateShareCode();
    try {
      const updated = await prisma.deck.update({
        where: { id: deckId },
        data: { shareCode: candidate },
        select: { shareCode: true },
      });
      return { shareCode: updated.shareCode! };
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === 'P2002') {
        // unique constraint — пробуем заново
        continue;
      }
      throw err;
    }
  }

  throw Object.assign(new Error('Failed to generate unique share code'), {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
  });
}

/**
 * Подписка на колоду по share-коду.
 * Создаёт локальную копию колоды (isSystemDeck=false, ownerId=currentUser)
 * с тем же набором слов. Затем подмешивает все слова в UserWordProgress.
 */
export async function subscribeByShareCode(userId: string, code: string) {
  const original = await prisma.deck.findUnique({
    where: { shareCode: code },
    include: { words: { select: { wordId: true } } },
  });
  if (!original) {
    throw Object.assign(new Error('Share code not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }

  // Не копируем системные колоды (у них нет shareCode в принципе, но на всякий случай).
  if (original.isSystemDeck) {
    throw Object.assign(new Error('Cannot subscribe to system deck via share code'), {
      statusCode: 400,
      code: 'FORBIDDEN',
    });
  }

  // Нельзя подписываться на собственную колоду — это создаст дубль.
  if (original.ownerId === userId) {
    throw Object.assign(new Error('Cannot subscribe to your own deck'), {
      statusCode: 400,
      code: 'FORBIDDEN',
    });
  }

  const wordIds = original.words.map((w) => w.wordId);

  // Создаём локальную копию колоды, чтобы не смешивать прогресс с автором.
  const localDeck = await prisma.deck.create({
    data: {
      name: original.name,
      description: original.description,
      isSystemDeck: false,
      ownerId: userId,
      words: {
        create: wordIds.map((wordId) => ({ wordId })),
      },
    },
    include: { _count: { select: { words: true } } },
  });

  // Подмешиваем все слова в UserWordProgress, пропуская уже существующие.
  let wordsAdded = 0;
  if (wordIds.length > 0) {
    const existing = await prisma.userWordProgress.findMany({
      where: { userId, wordId: { in: wordIds } },
      select: { wordId: true },
    });
    const existingIds = new Set(existing.map((e) => e.wordId));
    const newWords = wordIds.filter((wid) => !existingIds.has(wid));
    if (newWords.length > 0) {
      await prisma.userWordProgress.createMany({
        data: newWords.map((wordId) => ({
          userId,
          wordId,
          state: 'new' as const,
          dueDate: new Date(),
        })),
      });
      wordsAdded = newWords.length;
    }
  }

  return {
    deck: toDeckDto(localDeck),
    wordsAdded,
  };
}

/**
 * Подписка на колоду по её id (использовалось раньше).
 * Сейчас оставлено для совместимости.
 *
 * Доступ: системная — всем, кастомная — только владельцу. Чужая
 * приватная колода → 403, иначе можно было бы импортировать чужие
 * слова в свой прогресс, просто зная UUID. PLAN_Features_v0.4 §23.
 */
export async function subscribeToDeck(userId: string, deckId: string) {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { isSystemDeck: true, ownerId: true },
  });
  if (!deck) {
    throw Object.assign(new Error('Deck not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  if (!deck.isSystemDeck && deck.ownerId !== userId) {
    throw Object.assign(new Error('Not allowed to subscribe to this deck'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  const deckWords = await prisma.deckWord.findMany({
    where: { deckId },
    select: { wordId: true },
  });

  if (deckWords.length === 0) {
    return { wordsAdded: 0 };
  }

  const wordIds = deckWords.map((dw) => dw.wordId);

  const existing = await prisma.userWordProgress.findMany({
    where: { userId, wordId: { in: wordIds } },
    select: { wordId: true },
  });

  const existingIds = new Set(existing.map((e) => e.wordId));
  const newWords = wordIds.filter((wid) => !existingIds.has(wid));

  if (newWords.length === 0) {
    return { wordsAdded: 0 };
  }

  await prisma.userWordProgress.createMany({
    data: newWords.map((wordId) => ({
      userId,
      wordId,
      state: 'new' as const,
      dueDate: new Date(),
    })),
  });

  return { wordsAdded: newWords.length };
}
