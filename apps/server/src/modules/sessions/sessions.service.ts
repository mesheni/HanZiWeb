import { prisma } from '../../lib/prisma.js';
import { deckAccessWhere, findAccessibleDeck } from '../../lib/deckAccess.js';
import { computeElapsedDays, sanitizeClientTimestamp } from './timePolicy.js';
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
import {
  isTrainingPractice,
  PracticeTypeSchema,
  type PracticeType,
  type StartSession,
  type RecordAnswer,
  type UserAchievement,
  type Tag,
} from '@hanzi/shared';

/** Тип прогресса с включённым словом и примерами */
type ProgressWithWord = Prisma.UserWordProgressGetPayload<{
  include: { word: { include: { examples: true; tags: { include: { tag: true } } } } };
}>;

const HSK_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const HSK_LEVEL_LIST = [...HSK_LEVELS];

/**
 * F03: если все карточки сессии отвечены (cardsCompleted >= cardsTotal) —
 * проставляем `completedAt` идемпотентно. Пустая сессия (cardsTotal = 0)
 * не «завершается». Принимает `prisma` или транзакционный клиент.
 */
export async function markSessionCompleted(
  db: Pick<Prisma.TransactionClient, 'session'>,
  sessionId: string,
  cardsTotal: number,
  at: Date,
) {
  if (cardsTotal <= 0) return;
  await db.session.updateMany({
    where: { id: sessionId, cardsCompleted: { gte: cardsTotal }, completedAt: null },
    data: { completedAt: at },
  });
}

/**
 * Внутренний сигнал оптимистичной блокировки: строка прогресса изменилась
 * между чтением и записью (конкурентный ответ) — транзакция откатывается,
 * recordAnswer перечитывает и пересчитывает FSRS (PLANCorrection #17).
 */
class ConcurrentUpdateError extends Error {}

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

async function loadPriorityCards(userId: string, cardLimit: number): Promise<ProgressWithWord[]> {
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

  // F02: чужая приватная колода не должна ни отдавать свои слова, ни
  // светиться в deckName. Проверяем доступ ДО выборки слов; 404-shaped —
  // чтобы не утекать существование чужой приватной колоды.
  if (input.deckId) {
    const deck = await findAccessibleDeck(input.deckId, userId);
    if (!deck) {
      throw Object.assign(new Error('Deck not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
  }

  const deckWhere: Prisma.WordWhereInput = input.deckId
    ? { deckWords: { some: { deckId: input.deckId, deck: deckAccessWhere(userId) } } }
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
    input.includePriority !== false ? await loadPriorityCards(userId, input.cardLimit) : [];
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
    const wordWhere = intersectWordWithTagFilter(
      buildWordWhereForFilters(filters, deckWhere),
      tagFilteredWordIds,
    );

    // Коррелированный subquery вместо загрузки ВСЕХ id прогресса юзера
    // в память и `notIn`-массива из тысяч элементов (PLAN_Features_v0.4
    // §33): Postgres сам исключает слова, у которых есть запись
    // прогресса. Приоритетные слова уже имеют прогресс (создан в
    // loadPriorityCards), поэтому попадают под то же исключение.
    const freshWords = await prisma.word.findMany({
      where: {
        ...wordWhere,
        NOT: { progress: { some: { userId } } },
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

  // Приоритетные карточки — первыми (порядок добавления пользователем).
  // due + fresh перемешиваются Fisher-Yates. Фильтры наложены на Prisma `where`
  // выше, поэтому гарантированно применены ДО перемешивания.
  const allCards = [...priorityCards, ...shuffle([...dueWords, ...newWords])];

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
    stability: number;
    difficulty: number;
    distractors: string[];
  }> = allCards.map((p, i) => ({
    index: i,
    word: { ...p.word, tags: extractWordTags(p.word) },
    answered: false,
    state: p.state,
    // FSRS-параметры для оптимистичного пересчёта на клиенте
    // (PLAN_Features_v0.4 §50).
    stability: p.stability,
    difficulty: p.difficulty,
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
 *
 * Для **тренировочных** режимов (multiple-choice, pinyin-input, … —
 * см. `isTrainingPractice`) — оборонительный no-op: НЕ пересчитываем
 * FSRS, НЕ начисляем XP, НЕ проверяем достижения, НЕ создаём
 * `SessionAnswer`. Только инкрементируем `cardsCompleted` для логов
 * и возвращаем «нейтральный» SrsRecalcResult, чтобы API-контракт
 * не сломался, если клиент случайно пришлёт тренировочный ответ
 * (PLAN_Features_v0.3 §20).
 */
export async function recordAnswer(userId: string, input: RecordAnswer) {
  // Загружаем сессию, чтобы узнать practiceType (нужен для ветки
  // тренировочного режима). Делается ОДИН раз, используется только
  // в early-return ниже. Prisma хранит `practiceType` как `string`,
  // поэтому валидируем через Zod-схему — это даёт нам типизированный
  // `PracticeType` без `as`-кастов (PLAN_Features_v0.3 §20).
  //
  // `findFirst` с фильтром по `userId` закрывает IDOR: до фикса
  // `findUnique` грузил сессию только по id, и любой залогиненный
  // юзер мог постить `cardsCompleted++` / `SessionAnswer` в чужую
  // сессию, зная её UUID. Теперь чужая сессия = `null` = 404
  // (PLAN_Features_v0.4 §20).
  const session = await prisma.session.findFirst({
    where: { id: input.sessionId, userId },
    select: { practiceType: true, deckId: true, cardsTotal: true },
  });
  if (!session) {
    throw Object.assign(new Error('Session not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  // F03: сессия принимает ответы только на слова своей колоды. До фикса
  // можно было отвечать любое слово из своего прогресса — SessionAnswer,
  // прогресс слова и cardsCompleted загрязнялись словами вне колоды,
  // а cardsCompleted мог превысить cardsTotal.
  if (session.deckId) {
    const inDeck = await prisma.deckWord.findUnique({
      where: { deckId_wordId: { deckId: session.deckId, wordId: input.wordId } },
      select: { wordId: true },
    });
    if (!inDeck) {
      throw Object.assign(new Error('Word is not in the session deck'), {
        statusCode: 400,
        code: 'WORD_NOT_IN_DECK',
      });
    }
  }
  const parsedPracticeType = PracticeTypeSchema.safeParse(session.practiceType);
  const sessionPracticeType: PracticeType = parsedPracticeType.success
    ? parsedPracticeType.data
    : 'flip-card';

  if (isTrainingPractice(sessionPracticeType)) {
    // Тренировочный режим: прогресс нужен только для «нейтрального»
    // ответа — читается без блокировок, FSRS не пересчитывается.
    const progress = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId: input.wordId } },
    });
    if (!progress) {
      throw Object.assign(new Error('Progress not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    await prisma.session.update({
      where: { id: input.sessionId },
      data: { cardsCompleted: { increment: 1 } },
    });
    // F03: завершение сессии — по достижении cardsTotal ставим completedAt.
    await markSessionCompleted(prisma, input.sessionId, session.cardsTotal, new Date());
    return {
      wordId: input.wordId,
      newStability: progress.stability,
      newDifficulty: progress.difficulty,
      newState: progress.state,
      newDueDate: progress.dueDate.toISOString(),
      intervalDays: 0,
      xpGain: 0,
      unlockedAchievements: [],
    };
  }

  // Пересчёт по FSRS. `elapsedDays` — реальное время с последнего
  // повторения (PLAN_Features_v0.4 §35): опоздавшие ответы снижают
  // retrievability R и меняют пересчёт stability. Для новой карточки
  // (lastReviewDate нет) elapsed = 0 → R = 1.
  //
  // `answeredAt` — момент ответа, штампованный клиентом один раз
  // (fix v0.4 §45 follow-up). Если клиент его прислал, он же ложится
  // в `lastReviewDate`, и тогда у fallback-записи офлайн-очереди
  // (timestamp = тот же answeredAt) дедуп `changeTime <= existingTime`
  // в sync.service.ts срабатывает строго: T1 === T2 → повторный
  // пересчёт отбрасывается.
  // F04: сервер — источник истины для таймстемпов. Клиентский `answeredAt`
  // используется ТОЛЬКО для расчёта elapsed (реальное время офлайн-
  // ответа), и то с серверной границей — в `lastReviewDate`,
  // `SessionAnswer.answeredAt` и `completedAt` пишется серверное время.
  // Иначе клиент мог бы подделывать даты ответов и манипулировать
  // расписанием FSRS/стриком.
  const serverNow = new Date();
  const answeredAtMs = sanitizeClientTimestamp(
    input.answeredAt ? new Date(input.answeredAt).getTime() : undefined,
    serverNow.getTime(),
  );

  // Прогресс читается ВНУТРИ транзакции, а запись идёт через updateMany
  // с optimistic-условием (stability/reps как «версия» строки): два
  // конкурентных ответа на одно слово не теряют обновление — проигравший
  // получает count === 0, откатывается, перечитывает строку после
  // коммита победителя и пересчитывает FSRS от актуального состояния
  // (PLANCorrection #17). Ретрай ограничен тремя попытками.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const progress = await tx.userWordProgress.findUnique({
          where: { userId_wordId: { userId, wordId: input.wordId } },
        });

        if (!progress) {
          throw Object.assign(new Error('Progress not found'), {
            statusCode: 404,
            code: 'NOT_FOUND',
          });
        }

        const lastReviewMs = progress.lastReviewDate?.getTime() ?? 0;
        const elapsedDays = computeElapsedDays(lastReviewMs, answeredAtMs, serverNow.getTime());
        const { newStability, newDifficulty, newState, intervalDays } = recalcFsrs(
          input.rating,
          progress.stability,
          progress.difficulty,
          progress.state,
          elapsedDays,
        );

        const newDueDate = new Date();
        newDueDate.setDate(newDueDate.getDate() + intervalDays);

        // Шаги 1-3 (прогресс слова + ответ в сессии + счётчик сессии)
        // обязаны коммититься атомарно. До фикса это были четыре
        // независимых `await`: падение `sessionAnswer.create` оставляло
        // `UserWordProgress` уже изменённым, а `Session.cardsCompleted` —
        // без записи ответа (PLAN_Features_v0.4 §26). `xp` (User.update)
        // оставлен вне — он инкрементный, идемпотентный на уровне строки,
        // и при сбое основной транзакции его отсутствие лишь «не
        // награждает» пользователя.
        //
        // `sessionAnswer.create` защищён уникальным индексом
        // (sessionId, wordId): если ответ за то же слово в той же
        // сессии уже записан (дублирующий retry после ложной сетевой
        // ошибки), P2002 ловится ниже и возвращается идемпотентный
        // ответ без повторного пересчёта (fix v0.4 §45 follow-up).
        const updated = await tx.userWordProgress.updateMany({
          where: {
            userId,
            wordId: input.wordId,
            stability: progress.stability,
            reps: progress.reps,
          },
          data: {
            state: newState,
            stability: newStability,
            difficulty: newDifficulty,
            reps: { increment: 1 },
            dueDate: newDueDate,
            lastReviewDate: serverNow,
          },
        });
        if (updated.count === 0) {
          // Строка изменилась после нашего чтения — конкурентный ответ
          // уже закоммичен. Откатываем транзакцию и перечитываем.
          throw new ConcurrentUpdateError();
        }

        await tx.sessionAnswer.create({
          data: {
            sessionId: input.sessionId,
            wordId: input.wordId,
            rating: input.rating,
            answeredAt: serverNow,
          },
        });

        await tx.session.update({
          where: { id: input.sessionId },
          data: { cardsCompleted: { increment: 1 } },
        });

        // F03: завершение сессии — атомарно с ответом: если это был
        // последний ответ (cardsCompleted >= cardsTotal), ставим completedAt.
        await markSessionCompleted(tx, input.sessionId, session.cardsTotal, serverNow);

        return { newStability, newDifficulty, newState, newDueDate, intervalDays };
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
        unlockedAchievements = await achievementsService.checkAllAchievements(
          userId,
          input.sessionId,
        );
      } catch (err) {
        // Достижения не должны ломать основной поток
        console.error('checkAllAchievements failed', err);
      }

      return {
        wordId: input.wordId,
        newStability: outcome.newStability,
        newDifficulty: outcome.newDifficulty,
        newState: outcome.newState,
        newDueDate: outcome.newDueDate.toISOString(),
        intervalDays: outcome.intervalDays,
        xpGain,
        unlockedAchievements,
      };
    } catch (err) {
      if (err instanceof ConcurrentUpdateError) {
        continue;
      }
      // Уникальный индекс (sessionId, wordId) сработал — прогресс уже
      // пересчитан этим ответом. Возвращаем текущее состояние без
      // повторного применения (реps/XP не инкрементятся второй раз).
      if ((err as { code?: string }).code === 'P2002') {
        const current = await prisma.userWordProgress.findUnique({
          where: { userId_wordId: { userId, wordId: input.wordId } },
        });
        if (!current) throw err;
        return {
          wordId: input.wordId,
          newStability: current.stability,
          newDifficulty: current.difficulty,
          newState: current.state,
          newDueDate: current.dueDate.toISOString(),
          intervalDays: 0,
          xpGain: 0,
          unlockedAchievements: [],
        };
      }
      throw err;
    }
  }

  throw Object.assign(new Error('Too many concurrent updates, try again'), {
    statusCode: 409,
    code: 'CONFLICT',
  });
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
