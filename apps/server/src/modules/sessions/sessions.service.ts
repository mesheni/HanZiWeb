import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { recalcFsrs } from './srs.js';
import * as achievementsService from '../achievements/achievements.service.js';
import { wordIdsWithAnyTag } from '../tags/tags.service.js';
import {
  buildProgressWhereForFilters,
  buildWordWhereForFilters,
  intersectWithTagFilter,
  intersectWordWithTagFilter,
} from './sessionFilters.js';
import type { StartSession, RecordAnswer, UserAchievement, Tag } from '@hanzi/shared';

/** Тип прогресса с включённым словом и примерами */
type ProgressWithWord = Prisma.UserWordProgressGetPayload<{
  include: { word: { include: { examples: true; tags: { include: { tag: true } } } } };
}>;

const HSK_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const HSK_LEVEL_LIST = [...HSK_LEVELS];

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

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

async function loadPriorityCards(
  userId: string,
  cardLimit: number,
): Promise<ProgressWithWord[]> {
  const priorities = await prisma.userWordPriority.findMany({
    where: { userId },
    orderBy: { addedAt: 'asc' },
    take: cardLimit,
    include: { word: true },
  });
  if (priorities.length === 0) return [];

  const now = new Date();
  await prisma.userWordProgress.createMany({
    data: priorities.map((p) => ({
      userId,
      wordId: p.wordId,
      state: 'new' as const,
      dueDate: now,
    })),
    skipDuplicates: true,
  });

  const progressRecords = await prisma.userWordProgress.findMany({
    where: { userId, wordId: { in: priorities.map((p) => p.wordId) } },
    include: {
      word: { include: { examples: true, tags: { include: { tag: true } } } },
    },
  });

  const byWordId = new Map(progressRecords.map((p) => [p.wordId, p]));
  return priorities
    .map((p) => byWordId.get(p.wordId))
    .filter((p): p is ProgressWithWord => p !== undefined);
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

/** Извлекает DTO Tag[] из связки WordTag. */
function extractWordTags(
  word: Prisma.WordGetPayload<{ include: { tags: { include: { tag: true } } } }>,
): Tag[] {
  return word.tags.map((wt) => ({
    id: wt.tag.id,
    name: wt.tag.name,
    slug: wt.tag.slug,
    color: wt.tag.color,
    createdAt: wt.tag.createdAt.toISOString(),
  }));
}

/**
 * Генерирует новую сессию:
 * - Берёт слова, у которых dueDate <= now() (повтор)
 * - Добирает новые слова (state = NEW) до cardLimit
 *
 * Поддерживает фильтры из `StartSession.filters` (см. PLAN_Features_v0.2 §12):
 * - `minStability` / `maxStability` — тренировать только «забываемые»
 * - `tags` — слова должны иметь хотя бы один из указанных тегов
 * - `onlyWithAudio` — пропускать слова без audioUrl
 * - `onlyWithMnemonic` — пропускать слова без mnemonic
 */
export async function startSession(userId: string, input: StartSession) {
  const now = new Date();
  const mode = input.mode ?? 'mixed';
  const filters = input.filters;
  const unlockedLevel = input.deckId ? null : await getUnlockedHskLevel(userId);

  const deckWhere: Prisma.WordWhereInput = input.deckId
    ? { deckWords: { some: { deckId: input.deckId } } }
    : unlockedLevel
      ? { hskLevel: unlockedLevel }
      : { hskLevel: { in: HSK_LEVEL_LIST } };

  // Если задан фильтр по тегам, заранее вычисляем id подходящих слов.
  // Это сокращает выборку, если слов без тегов очень много.
  const tagFilteredWordIds: string[] | null =
    filters?.tags && filters.tags.length > 0 ? await wordIdsWithAnyTag(filters.tags) : null;

  // Для due-карточек: пересекаем фильтр stability + audio/mnemonic + tags с deckScope.
  // `buildProgressWhereForFilters` уже накладывает deckScope (если не задан фильтр
  // по audio/mnemonic). Передаём deckScope, чтобы deck-фильтрация работала вместе
  // с audio/mnemonic.
  const baseProgressWhere = buildProgressWhereForFilters(
    filters,
    input.deckId ? deckWhere : undefined,
  );
  const progressWhere = intersectWithTagFilter(baseProgressWhere, tagFilteredWordIds);

  // Приоритетные слова из вкладки «Чтение» — идут первыми.
  const priorityCards =
    input.includePriority !== false
      ? await loadPriorityCards(userId, input.cardLimit)
      : [];
  const priorityWordIds = new Set(priorityCards.map((p) => p.wordId));
  const remainingLimit = Math.max(0, input.cardLimit - priorityCards.length);

  const dueWords: ProgressWithWord[] =
    mode === 'learn' || remainingLimit === 0
      ? []
      : ((await prisma.userWordProgress.findMany({
          where: {
            userId,
            dueDate: { lte: now },
            state: { not: 'new' },
            wordId: { notIn: Array.from(priorityWordIds) },
            ...progressWhere,
          },
          include: {
            word: { include: { examples: true, tags: { include: { tag: true } } } },
          },
          orderBy: [
            { dueDate: 'asc' },
            { word: { hskLevel: 'asc' } },
            { word: { createdAt: 'asc' } },
          ],
          take: remainingLimit,
        })) as ProgressWithWord[]);

  // Если нужен микс или режим только новых слов, подбираем fresh words.
  const newWordsNeeded =
    mode === 'review' || remainingLimit === 0
      ? 0
      : mode === 'learn'
        ? remainingLimit
        : Math.max(0, remainingLimit - dueWords.length);
  let newWords: ProgressWithWord[] = [];

  if (newWordsNeeded > 0 && (input.includeNew || mode === 'learn')) {
    // Ищем слова, для которых у пользователя нет прогресса
    const existingWordIds = await prisma.userWordProgress.findMany({
      where: { userId },
      select: { wordId: true },
    });
    const excludeIds = [
      ...existingWordIds.map((p: { wordId: string }) => p.wordId),
      ...priorityWordIds,
    ];

    const wordWhere = intersectWordWithTagFilter(
      buildWordWhereForFilters(filters, deckWhere),
      tagFilteredWordIds,
    );

    const freshWords = await prisma.word.findMany({
      where: {
        id: { notIn: excludeIds },
        ...wordWhere,
      },
      include: { examples: true, tags: { include: { tag: true } } },
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
      include: {
        word: { include: { examples: true, tags: { include: { tag: true } } } },
      },
      orderBy: [{ word: { hskLevel: 'asc' } }, { word: { createdAt: 'asc' } }],
    })) as ProgressWithWord[];
  }

  const allCards = [...priorityCards, ...orderCards([...dueWords, ...newWords])];

  // Для режима `character_assembly` подбираем иероглифы-дистракторы из
  // других слов того же HSK-уровня, не пересекающиеся с иероглифами целевого слова.
  const characterDistractors =
    input.practiceType === 'character_assembly'
      ? await pickCharacterDistractors(allCards)
      : new Map<string, string[]>();

  // Создаём сессию
  const deckName = input.deckId
    ? ((await prisma.deck.findUnique({ where: { id: input.deckId } }))?.name ?? undefined)
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
  const cards: Array<{
    index: number;
    word: unknown;
    answered: boolean;
    state: string;
    distractors: string[];
  }> = allCards.map((p, i) => ({
    index: i,
    word: { ...p.word, tags: extractWordTags(p.word) },
    answered: false,
    state: p.state,
    distractors: characterDistractors.get(p.word.id) ?? [],
  }));

  return {
    ...session,
    deckName,
    cards,
    appliedFilters: filters ?? null,
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
    unlockedAchievements = await achievementsService.checkAllAchievements(userId, input.sessionId);
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
    include: { examples: true, tags: { include: { tag: true } } },
    orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
    skip,
    take: count,
  });
}

/**
 * Возвращает случайные слова, иероглифы которых не пересекаются с
 * иероглифами целевого слова. Используется для режима `character_assembly`.
 */
export async function getRandomCharacterDistractorWords(targetWordId: string, count: number) {
  const target = await prisma.word.findUnique({
    where: { id: targetWordId },
    select: { id: true, character: true, hskLevel: true },
  });
  if (!target) return getRandomWords([], count);

  const targetChars = new Set(Array.from(target.character));
  const where: Prisma.WordWhereInput = {
    id: { not: target.id },
    hskLevel: target.hskLevel != null ? target.hskLevel : undefined,
  };

  const total = await prisma.word.count({ where });
  if (total === 0) return [];

  const take = Math.min(100, total);
  const skip = Math.max(0, Math.floor(Math.random() * Math.max(0, total - take)));
  const words = await prisma.word.findMany({
    where,
    include: { examples: true, tags: { include: { tag: true } } },
    orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
    skip,
    take,
  });

  const filtered = words.filter((w) => Array.from(w.character).every((ch) => !targetChars.has(ch)));
  return shuffle(filtered).slice(0, count);
}

/**
 * Подбирает иероглифы-дистракторы для каждой карточки режима
 * `character_assembly` из других слов того же HSK-уровня.
 */
async function pickCharacterDistractors(cards: ProgressWithWord[]): Promise<Map<string, string[]>> {
  const targetIds = cards.map((c) => c.word.id);
  const levels = [
    ...new Set(cards.map((c) => c.word.hskLevel).filter((l): l is number => l != null)),
  ];

  const where: Prisma.WordWhereInput = {
    id: targetIds.length > 0 ? { notIn: targetIds } : undefined,
    hskLevel: levels.length > 0 ? { in: levels } : undefined,
  };

  const total = await prisma.word.count({ where });
  const pool =
    total === 0
      ? []
      : await prisma.word.findMany({
          where,
          select: { id: true, character: true },
          orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
          skip: Math.max(0, Math.floor(Math.random() * Math.max(0, total - 100))),
          take: 100,
        });

  const result = new Map<string, string[]>();
  for (const card of cards) {
    const targetChars = new Set(Array.from(card.word.character));
    const candidates = [
      ...new Set(
        pool
          .filter((w) => w.id !== card.word.id)
          .flatMap((w) => Array.from(w.character))
          .filter((ch) => !targetChars.has(ch)),
      ),
    ];
    result.set(card.word.id, shuffle(candidates).slice(0, 6));
  }
  return result;
}
