import type { Prisma } from '@prisma/client';
import type { SessionFilters } from '@hanzi/shared';

/**
 * Чистые хелперы для построения Prisma-условий по фильтрам сессии.
 *
 * Вынесены в отдельный модуль, чтобы их можно было покрыть
 * unit-тестами без моков Prisma.
 *
 * См. PLAN_Features_v0.2 §12.
 */

/**
 * Строит условие для UserWordProgress с учётом фильтров.
 *
 * Учитывает:
 * - `minStability` / `maxStability` — на `stability` записи прогресса;
 * - `onlyWithAudio` / `onlyWithMnemonic` — на `word` (relation);
 * - `tags` — НЕ накладывается здесь (вычисляется отдельным запросом
 *   `wordIdsWithAnyTag` из-за особенностей many-to-many).
 *
 * @param filters      Фильтры сессии (может быть `undefined`).
 * @param deckIdScope  Дополнительное условие на Word (например, scope колоды).
 *                     Передаётся через `word.is: deckIdScope` если задано.
 */
export function buildProgressWhereForFilters(
  filters: SessionFilters | undefined,
  deckIdScope?: Prisma.WordWhereInput,
): Prisma.UserWordProgressWhereInput {
  const where: Prisma.UserWordProgressWhereInput = {};

  // Stability (FSRS stability — в днях). Не путать с `state`!
  if (filters && (filters.minStability !== undefined || filters.maxStability !== undefined)) {
    where.stability = {};
    if (filters.minStability !== undefined) {
      where.stability.gte = filters.minStability;
    }
    if (filters.maxStability !== undefined) {
      where.stability.lte = filters.maxStability;
    }
  }

  // audioUrl и mnemonic — на уровне Word
  if (filters?.onlyWithAudio || filters?.onlyWithMnemonic) {
    const wordCondition: Prisma.WordWhereInput = {};
    if (filters.onlyWithAudio) {
      wordCondition.audioUrl = { not: null };
    }
    if (filters.onlyWithMnemonic) {
      wordCondition.mnemonic = { not: null };
    }
    where.word = deckIdScope
      ? { is: { ...wordCondition, ...deckIdScope } }
      : { is: wordCondition };
  } else if (deckIdScope) {
    where.word = { is: deckIdScope };
  }

  return where;
}

/**
 * Условие для Word (используется при подборе fresh-слов).
 *
 * Учитывает:
 * - `onlyWithAudio` / `onlyWithMnemonic` — на самом `Word`;
 * - `tags` — НЕ накладывается здесь;
 * - `stability` — НЕ накладывается здесь (у новых слов stability=0,
 *   и фильтр на «забываемые» к ним не имеет смысла).
 *
 * @param filters      Фильтры сессии.
 * @param deckIdScope  Дополнительное условие (например, scope колоды).
 */
export function buildWordWhereForFilters(
  filters: SessionFilters | undefined,
  deckIdScope?: Prisma.WordWhereInput,
): Prisma.WordWhereInput {
  const where: Prisma.WordWhereInput = {};
  if (filters?.onlyWithAudio) where.audioUrl = { not: null };
  if (filters?.onlyWithMnemonic) where.mnemonic = { not: null };
  if (deckIdScope) {
    return { AND: [where, deckIdScope] };
  }
  return where;
}

/**
 * Пересекает уже построенный `progressWhere.word` с фильтром по тегам.
 * Возвращает новый where-объект, готовый к использованию в
 * `prisma.userWordProgress.findMany({ where })`.
 *
 * @param progressWhere        Уже построенное условие (с возможным `.word`).
 * @param tagFilteredWordIds    null = фильтр по тегам не задан; [] = ни одно
 *                             слово не подходит; иначе — список word.id.
 */
export function intersectWithTagFilter(
  progressWhere: Prisma.UserWordProgressWhereInput,
  tagFilteredWordIds: string[] | null,
): Prisma.UserWordProgressWhereInput {
  if (tagFilteredWordIds === null) return progressWhere;

  const existingWord = progressWhere.word as
    | { is?: Prisma.WordWhereInput }
    | undefined;
  const baseWord = existingWord?.is ?? {};
  const tagWhere: Prisma.WordWhereInput = { id: { in: tagFilteredWordIds } };

  return {
    ...progressWhere,
    word: existingWord
      ? { is: { ...baseWord, ...tagWhere } }
      : { is: tagWhere },
  };
}

/**
 * Пересекает условие для Word с фильтром по тегам.
 */
export function intersectWordWithTagFilter(
  wordWhere: Prisma.WordWhereInput,
  tagFilteredWordIds: string[] | null,
): Prisma.WordWhereInput {
  if (tagFilteredWordIds === null) return wordWhere;
  const tagWhere: Prisma.WordWhereInput = { id: { in: tagFilteredWordIds } };
  // Если уже есть AND — добавляем внутрь, иначе создаём AND.
  if (wordWhere.AND) {
    const existing = Array.isArray(wordWhere.AND) ? wordWhere.AND : [wordWhere.AND];
    return { ...wordWhere, AND: [...existing, tagWhere] };
  }
  return { ...wordWhere, id: { in: tagFilteredWordIds } };
}
