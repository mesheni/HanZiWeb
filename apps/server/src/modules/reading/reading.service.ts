import { prisma } from '../../lib/prisma.js';
import type { ReadingTextDetail, ReadingTextListItem, WordState } from '@hanzi/shared';

export type ReadingSort = 'default' | 'familiarity';

export async function listTexts(
  userId: string,
  hskLevel?: number,
  sort: ReadingSort = 'default',
): Promise<ReadingTextListItem[]> {
  const texts = await prisma.readingText.findMany({
    where: hskLevel !== undefined ? { hskLevel } : {},
    orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
    // Для knownWordsCount нужен только wordId каждого токена — полные
    // join-строки не нужны.
    include: { words: { select: { wordId: true } } },
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

  const items = texts.map((text) => {
    const knownWordsCount = text.words.filter((w) => knownWordIds.has(w.wordId)).length;
    // Знакомость считаем по сопоставленным токенам (text.words), а не по
    // общему wordCount — так процент отражает именно изученную лексику.
    const tokensTotal = text.words.length;
    const familiarPercent = tokensTotal > 0 ? Math.round((knownWordsCount / tokensTotal) * 100) : 0;
    return {
      id: text.id,
      title: text.title,
      hskLevel: text.hskLevel,
      wordCount: text.wordCount,
      knownWordsCount,
      familiarPercent,
      author: text.author,
      source: text.source,
      readAt: readMap.get(text.id) ?? null,
    };
  });

  if (sort === 'familiarity') {
    // «По знакомости»: от самого понятного к самому новому — быстрый
    // выбор «что почитать прямо сейчас без словаря».
    return items.sort((a, b) => b.familiarPercent - a.familiarPercent);
  }
  return items;
}

export async function getText(userId: string, textId: string): Promise<ReadingTextDetail | null> {
  const text = await prisma.readingText.findUnique({
    where: { id: textId },
  });
  if (!text) return null;

  const tokens = await prisma.readingTextWord.findMany({
    where: { textId },
    // Полные строки Word не нужны: в токене используются только эти
    // поля (mnemonic/createdAt/example-отношения не читаются).
    include: {
      word: {
        select: {
          id: true,
          character: true,
          pinyin: true,
          translation: true,
          hskLevel: true,
          audioUrl: true,
        },
      },
    },
    orderBy: { position: 'asc' },
  });

  const wordIds = tokens.map((t) => t.wordId);
  const progress =
    wordIds.length > 0
      ? await prisma.userWordProgress.findMany({
          where: { userId, wordId: { in: wordIds } },
          select: { wordId: true, state: true },
        })
      : [];
  const stateMap = new Map(progress.map((p) => [p.wordId, p.state as WordState]));

  const priorities =
    wordIds.length > 0
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
  // F14: до фикса несуществующий текст «отмечался прочитанным» молча
  // (return без ошибки) — клиент видел success, а прогресс не создавался.
  // Теперь 404 NOT_FOUND, как в GET /texts/:id.
  if (!text) {
    throw Object.assign(new Error('Text not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  await prisma.userReadingProgress.upsert({
    where: { userId_textId: { userId, textId } },
    update: { readAt: new Date() },
    create: { userId, textId },
  });
}
