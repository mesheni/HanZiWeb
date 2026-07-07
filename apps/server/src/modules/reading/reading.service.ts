import { prisma } from '../../lib/prisma.js';
import type { ReadingTextDetail, ReadingTextListItem, WordState } from '@hanzi/shared';

export async function listTexts(
  userId: string,
  hskLevel?: number,
): Promise<ReadingTextListItem[]> {
  const texts = await prisma.readingText.findMany({
    where: hskLevel !== undefined ? { hskLevel } : {},
    orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
    include: { words: true },
  });

  const progress = await prisma.userWordProgress.findMany({
    where: { userId },
    select: { wordId: true },
  });
  const knownWordIds = new Set(progress.map((p) => p.wordId));

  const readingProgress = await prisma.userReadingProgress.findMany({
    where: { userId },
    select: { textId: true, readAt: true },
  });
  const readMap = new Map(readingProgress.map((p) => [p.textId, p.readAt.toISOString()]));

  return texts.map((text) => {
    const knownWordsCount = text.words.filter((w) => knownWordIds.has(w.wordId)).length;
    return {
      id: text.id,
      title: text.title,
      hskLevel: text.hskLevel,
      wordCount: text.wordCount,
      knownWordsCount,
      author: text.author,
      source: text.source,
      readAt: readMap.get(text.id) ?? null,
    };
  });
}

export async function getText(userId: string, textId: string): Promise<ReadingTextDetail | null> {
  const text = await prisma.readingText.findUnique({
    where: { id: textId },
  });
  if (!text) return null;

  const tokens = await prisma.readingTextWord.findMany({
    where: { textId },
    include: { word: true },
    orderBy: { position: 'asc' },
  });

  const wordIds = tokens.map((t) => t.wordId);
  const progress = wordIds.length > 0
    ? await prisma.userWordProgress.findMany({
        where: { userId, wordId: { in: wordIds } },
        select: { wordId: true, state: true },
      })
    : [];
  const stateMap = new Map(progress.map((p) => [p.wordId, p.state as WordState]));

  const priorities = wordIds.length > 0
    ? await prisma.userWordPriority.findMany({
        where: { userId, wordId: { in: wordIds } },
        select: { wordId: true },
      })
    : [];
  const prioritySet = new Set(priorities.map((p) => p.wordId));

  const readProgress = await prisma.userReadingProgress.findUnique({
    where: { userId_textId: { userId, textId } },
    select: { readAt: true },
  });

  return {
    id: text.id,
    title: text.title,
    hskLevel: text.hskLevel,
    author: text.author,
    source: text.source,
    wordCount: text.wordCount,
    paragraphs: text.content.split('\n\n'),
    tokens: tokens.map((t) => ({
      position: t.position,
      length: t.length,
      surface: text.content.slice(t.position, t.position + t.length),
      word: t.word
        ? {
            id: t.word.id,
            character: t.word.character,
            pinyin: t.word.pinyin,
            translation: t.word.translation,
            hskLevel: t.word.hskLevel,
            audioUrl: t.word.audioUrl ?? null,
          }
        : null,
      state: stateMap.get(t.wordId) ?? null,
      isPriority: prioritySet.has(t.wordId),
    })),
    readAt: readProgress?.readAt.toISOString() ?? null,
  };
}

export async function addPriorityWords(
  userId: string,
  textId: string,
  wordIds: string[],
): Promise<number> {
  const existing = await prisma.readingTextWord.findMany({
    where: { textId, wordId: { in: wordIds } },
    select: { wordId: true },
  });
  const validIds = new Set(existing.map((e) => e.wordId));
  const toAdd = wordIds.filter((id) => validIds.has(id));
  if (toAdd.length === 0) return 0;

  const result = await prisma.userWordPriority.createMany({
    data: toAdd.map((wordId) => ({ userId, wordId })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function markRead(userId: string, textId: string): Promise<void> {
  const text = await prisma.readingText.findUnique({
    where: { id: textId },
    select: { id: true },
  });
  if (!text) return;

  await prisma.userReadingProgress.upsert({
    where: { userId_textId: { userId, textId } },
    update: { readAt: new Date() },
    create: { userId, textId },
  });
}
