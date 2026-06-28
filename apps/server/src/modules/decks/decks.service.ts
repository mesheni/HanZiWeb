import { prisma } from '../../lib/prisma.js';

/**
 * List all decks with word counts.
 */
export async function listDecks() {
  const decks = await prisma.deck.findMany({
    include: {
      _count: {
        select: { words: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return decks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    description: deck.description,
    isSystemDeck: deck.isSystemDeck,
    wordCount: deck._count.words,
    createdAt: deck.createdAt.toISOString(),
  }));
}

/**
 * Get a single deck by ID, including its words.
 */
export async function getDeck(id: string) {
  return prisma.deck.findUnique({
    where: { id },
    include: {
      words: {
        include: {
          word: {
            include: {
              examples: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Subscribe a user to a deck — adds all deck words to UserWordProgress as 'new'.
 * Skips words the user already has in progress.
 */
export async function subscribeToDeck(userId: string, deckId: string) {
  // Find all word IDs in the deck
  const deckWords = await prisma.deckWord.findMany({
    where: { deckId },
    select: { wordId: true },
  });

  if (deckWords.length === 0) {
    return { wordsAdded: 0 };
  }

  const wordIds = deckWords.map((dw) => dw.wordId);

  // Find existing progress entries for this user+words
  const existing = await prisma.userWordProgress.findMany({
    where: {
      userId,
      wordId: { in: wordIds },
    },
    select: { wordId: true },
  });

  const existingIds = new Set(existing.map((e) => e.wordId));
  const newWords = wordIds.filter((wid) => !existingIds.has(wid));

  if (newWords.length === 0) {
    return { wordsAdded: 0 };
  }

  // Create progress entries in bulk
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
