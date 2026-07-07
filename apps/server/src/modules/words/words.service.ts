import { prisma } from '../../lib/prisma.js';
import type {
  CreateWord,
  UpdateWord,
  WordFilters,
  WordListItem,
  RecentWordsQuery,
  Pagination,
} from '@hanzi/shared';
import type { Prisma } from '@prisma/client';

/** Какие relations подгружаются по умолчанию при запросах Word. */
const WORD_INCLUDE = {
  examples: true,
  tags: { include: { tag: true } },
} satisfies Prisma.WordInclude;

/** Приводит записи WordTag к массиву Tag. */
function extractTags(
  word: Prisma.WordGetPayload<{ include: typeof WORD_INCLUDE }>,
) {
  return word.tags.map((wt) => ({
    id: wt.tag.id,
    name: wt.tag.name,
    slug: wt.tag.slug,
    color: wt.tag.color,
    createdAt: wt.tag.createdAt.toISOString(),
  }));
}

export async function listWords(filters: WordFilters, userId?: string) {
  const where: Prisma.WordWhereInput = {};

  if (filters.search) {
    where.OR = [
      { character: { contains: filters.search, mode: 'insensitive' } },
      { pinyin: { contains: filters.search.toLowerCase(), mode: 'insensitive' } },
      { translation: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.hskLevel) {
    where.hskLevel = filters.hskLevel;
  }

  if (filters.deckId) {
    where.deckWords = { some: { deckId: filters.deckId } };
  }

  if (filters.status && userId) {
    where.progress = { some: { userId, state: filters.status } };
  }

  const [data, total] = await Promise.all([
    prisma.word.findMany({
      where,
      include: WORD_INCLUDE,
      skip: filters.offset,
      take: filters.limit,
      orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.word.count({ where }),
  ]);

  // Если есть userId, подмешиваем статус прогресса к каждому слову
  let wordsWithStatus = data.map((w) => ({
    ...w,
    tags: extractTags(w),
  }));
  if (userId) {
    const wordIds = data.map((w) => w.id);
    const progressMap = new Map(
      (
        await prisma.userWordProgress.findMany({
          where: { userId, wordId: { in: wordIds } },
          select: { wordId: true, state: true },
        })
      ).map((p) => [p.wordId, p.state]),
    );
    wordsWithStatus = wordsWithStatus.map((w) => ({
      ...w,
      status: progressMap.get(w.id) ?? 'new',
    }));
  }

  const pagination: Pagination = {
    total,
    limit: filters.limit,
    offset: filters.offset,
  };

  return { data: wordsWithStatus, pagination };
}

/**
 * Возвращает последние `limit` изученных слов пользователя, отсортированных
 * по `lastReviewDate DESC`. Дубликатов нет — `UserWordProgress` имеет
 * `@@unique([userId, wordId])`, так что каждое слово встречается ровно
 * один раз (PLAN_Features_v0.3 §17).
 *
 * Слова, у которых `lastReviewDate` ещё `null` (только что добавленные
 * в прогресс, но ни разу не отвеченные), отфильтровываются — иначе
 * на главной всплывали бы «новые» карточки, которые пользователь
 * ещё не видел.
 */
export async function getRecentWords(
  userId: string,
  query: RecentWordsQuery,
): Promise<WordListItem[]> {
  const progress = await prisma.userWordProgress.findMany({
    where: {
      userId,
      lastReviewDate: { not: null },
    },
    orderBy: { lastReviewDate: 'desc' },
    take: query.limit,
    select: {
      state: true,
      word: {
        select: {
          id: true,
          character: true,
          pinyin: true,
          translation: true,
          hskLevel: true,
        },
      },
    },
  });

  return progress.map((p) => ({
    id: p.word.id,
    character: p.word.character,
    pinyin: p.word.pinyin,
    translation: p.word.translation,
    hskLevel: p.word.hskLevel,
    status: p.state,
  }));
}

export async function getWord(id: string, userId?: string) {
  const word = await prisma.word.findUnique({
    where: { id },
    include: WORD_INCLUDE,
  });

  if (!word) return null;

  let userProgress: { state: string } | null = null;
  if (userId) {
    const progress = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId: id } },
      select: { state: true },
    });
    if (progress) {
      userProgress = { state: progress.state };
    }
  }

  return { ...word, tags: extractTags(word), userProgress };
}

export async function createWord(input: CreateWord) {
  return prisma.word.create({
    data: {
      character: input.character,
      pinyin: input.pinyin,
      translation: input.translation,
      hskLevel: input.hskLevel,
      audioUrl: input.audioUrl,
      mnemonic: input.mnemonic,
      examples: input.examples
        ? { create: input.examples.map((e) => ({ chinese: e.chinese, russian: e.russian })) }
        : undefined,
    },
    include: WORD_INCLUDE,
  });
}

export async function updateWord(id: string, input: UpdateWord) {
  return prisma.word.update({
    where: { id },
    data: {
      ...(input.character !== undefined && { character: input.character }),
      ...(input.pinyin !== undefined && { pinyin: input.pinyin }),
      ...(input.translation !== undefined && { translation: input.translation }),
      ...(input.hskLevel !== undefined && { hskLevel: input.hskLevel }),
      ...(input.audioUrl !== undefined && { audioUrl: input.audioUrl }),
      ...(input.mnemonic !== undefined && { mnemonic: input.mnemonic }),
    },
    include: WORD_INCLUDE,
  });
}

export async function deleteWord(id: string) {
  await prisma.word.delete({ where: { id } });
}
