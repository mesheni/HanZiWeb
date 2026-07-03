import { prisma } from '../../lib/prisma.js';
import type { CreateTag, Tag } from '@hanzi/shared';
import type { Prisma } from '@prisma/client';

/** Преобразует запись Tag из Prisma в DTO для API. */
function toTagDto(tag: {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: Date;
}): Tag {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
  };
}

/** Список всех тегов (с подсчётом слов). */
export async function listTags() {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { words: true } } },
    orderBy: { name: 'asc' },
  });
  return tags.map((t) => ({ ...toTagDto(t), wordCount: t._count.words }));
}

/** Получить тег по id. */
export async function getTag(id: string) {
  const tag = await prisma.tag.findUnique({ where: { id } });
  return tag ? toTagDto(tag) : null;
}

/** Создать тег. */
export async function createTag(input: CreateTag): Promise<Tag> {
  try {
    const tag = await prisma.tag.create({
      data: {
        name: input.name,
        slug: input.slug,
        color: input.color ?? null,
      },
    });
    return toTagDto(tag);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      throw Object.assign(new Error(`Tag with slug "${input.slug}" already exists`), {
        statusCode: 409,
        code: 'TAG_EXISTS',
      });
    }
    throw err;
  }
}

/** Удалить тег (Cascade удалит WordTag). */
export async function deleteTag(id: string) {
  const existing = await prisma.tag.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw Object.assign(new Error('Tag not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  await prisma.tag.delete({ where: { id } });
  return { deleted: id };
}

/** Установить набор тегов для слова (replace). */
export async function setWordTags(wordId: string, tagIds: string[]) {
  // Проверяем, что слово существует
  const word = await prisma.word.findUnique({ where: { id: wordId }, select: { id: true } });
  if (!word) {
    throw Object.assign(new Error('Word not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  // Проверяем, что все tagIds существуют
  if (tagIds.length > 0) {
    const found = await prisma.tag.findMany({
      where: { id: { in: tagIds } },
      select: { id: true },
    });
    if (found.length !== tagIds.length) {
      throw Object.assign(new Error('Some tags not found'), {
        statusCode: 400,
        code: 'INVALID_TAGS',
      });
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.wordTag.deleteMany({ where: { wordId } });
    if (tagIds.length > 0) {
      await tx.wordTag.createMany({
        data: tagIds.map((tagId) => ({ wordId, tagId })),
        skipDuplicates: true,
      });
    }
    const tags = await tx.tag.findMany({
      where: { words: { some: { wordId } } },
      orderBy: { name: 'asc' },
    });
    return tags.map(toTagDto);
  });
}

/** Получить теги слова. */
export async function getWordTags(wordId: string) {
  const tags = await prisma.tag.findMany({
    where: { words: { some: { wordId } } },
    orderBy: { name: 'asc' },
  });
  return tags.map(toTagDto);
}

/** Слова, у которых есть хотя бы один из указанных тегов (OR-логика). */
export async function wordIdsWithAnyTag(
  tagIds: string[],
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const rows = await tx.wordTag.findMany({
    where: { tagId: { in: tagIds } },
    select: { wordId: true },
    distinct: ['wordId'],
  });
  return rows.map((r) => r.wordId);
}
