import { prisma } from './prisma.js';
import type { Prisma } from '@prisma/client';

/**
 * Условие видимости колоды: системные (HSK) видны всем, кастомные —
 * только владельцу. Чужие приватные колоды не видны никому.
 * Конвенция повторяет `listDecksForUser` / `loadDeckForUser`
 * (PLAN_Features_v0.4 §23). Это единый хелпер для всех точек, где
 * контент фильтруется по `deckId` (F02): study-map, words?deckId,
 * sessions.start.
 *
 * `userId === undefined` (optional-auth пути без токена) — видны только
 * системные колоды.
 */
export function deckAccessWhere(userId?: string): Prisma.DeckWhereInput {
  const access: Prisma.DeckWhereInput[] = [{ isSystemDeck: true }];
  if (userId) access.push({ ownerId: userId });
  return { OR: access };
}

/**
 * Находит колоду по id при условии доступа.
 * null — колоды нет ИЛИ она приватная и принадлежит другому пользователю.
 * Намеренно «404-shaped» (а не 403) — чтобы не утекать существование
 * чужой приватной колоды (как в `loadDeckForUser`).
 */
export async function findAccessibleDeck(deckId: string, userId?: string) {
  return prisma.deck.findFirst({
    where: { id: deckId, ...deckAccessWhere(userId) },
    select: { id: true, name: true },
  });
}
