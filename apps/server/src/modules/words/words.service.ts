import { prisma } from '../../lib/prisma.js';
import type { CreateWord, UpdateWord, WordFilters, Pagination } from '@hanzi/shared';
import type { Prisma } from '@prisma/client';

export async function listWords(filters: WordFilters) {
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

  const [data, total] = await Promise.all([
    prisma.word.findMany({
      where,
      include: { examples: true },
      skip: filters.offset,
      take: filters.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.word.count({ where }),
  ]);

  const pagination: Pagination = {
    total,
    limit: filters.limit,
    offset: filters.offset,
  };

  return { data, pagination };
}

export async function getWord(id: string) {
  return prisma.word.findUnique({
    where: { id },
    include: { examples: true },
  });
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
    include: { examples: true },
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
    include: { examples: true },
  });
}

export async function deleteWord(id: string) {
  await prisma.word.delete({ where: { id } });
}
