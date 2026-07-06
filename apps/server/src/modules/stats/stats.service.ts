import { prisma } from '../../lib/prisma.js';
import {
  DAILY_GOAL_DEFAULT,
  PROGRESS_EXPORT_VERSION,
  getDeckProgressColor,
  type DeckProgress,
  type DeckProgressColor,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type ProgressExport,
  type ProgressImportMode,
  type ProgressImportResponse,
  type ProgressRecord,
  type StudyMapResponse,
} from '@hanzi/shared';

/** Карта «rating → XP». Должна совпадать с sessions.service.recordAnswer. */
export const RATING_XP: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 5 };

/** Начало текущей ISO-недели (Пн 00:00:00 UTC) и конец (exclusive). */
export function getCurrentWeekWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  // getUTCDay: 0=Вс, 1=Пн, ..., 6=Сб. Приводим к 0..6 где 0=Пн.
  const dow = (start.getUTCDay() + 6) % 7;
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - dow);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

/** Маскирует email в короткое публичное имя: "alice@gmail.com" → "al***@gmail.com". */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@', 2);
  if (!local || !domain) return '***';
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

/**
 * Считает суммарный XP за неделю по пользователю из плоского списка
 * ответов. Чистая функция — используется в `getLeaderboard` и
 * покрыта юнит-тестами.
 */
export function aggregateWeeklyXp(
  answers: Array<{ rating: number; userId: string }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of answers) {
    const gain = RATING_XP[a.rating] ?? 0;
    if (gain === 0) continue;
    out.set(a.userId, (out.get(a.userId) ?? 0) + gain);
  }
  return out;
}

/**
 * Считает ранг текущего пользователя в `xpByUser` (1-based).
 * Тот, у кого строго больше XP — обходит. При равном XP — оба делят
 * место; мы возвращаем позицию «после всех с большим XP», что даёт
 * стабильный порядок в плотных топах.
 */
export function computeRank(myXp: number, xpByUser: Map<string, number>): number {
  let better = 0;
  for (const xp of xpByUser.values()) {
    if (xp > myXp) better += 1;
  }
  return better + 1;
}

/**
 * Возвращает лидерборд за период (`week` | `all`).
 *
 * - `all`  — топ-100 пользователей по `User.xp` (использует индекс
 *   `User_xp_idx`).
 * - `week` — топ-100 пользователей по XP, заработанному за текущую
 *   календарную неделю (Пн–Вс, UTC), агрегированному из
 *   `SessionAnswer.answeredAt` + `rating`.
 *
 * Текущий пользователь помечается `isCurrentUser: true` и в
 * `currentUser` отдельной записью, если не вошёл в топ.
 */
export async function getLeaderboard(
  userId: string,
  period: 'week' | 'all',
  limit: number = 100,
): Promise<LeaderboardResponse> {
  // ── 1. Сбор XP за выбранный период ─────────────────────────────
  const weekWindow = period === 'week' ? getCurrentWeekWindow() : null;
  let xpByUser: Map<string, number> = new Map();
  if (weekWindow) {
    const weekAnswers = await prisma.sessionAnswer.findMany({
      where: { answeredAt: { gte: weekWindow.start, lt: weekWindow.end } },
      select: { rating: true, session: { select: { userId: true } } },
    });
    xpByUser = aggregateWeeklyXp(
      weekAnswers.map((a) => ({ rating: a.rating, userId: a.session.userId })),
    );
  }

  // ── 2. Топ-N по XP ────────────────────────────────────────────
  let topRows: Array<{ userId: string; xp: number; email: string; currentStreak: number }>;

  if (period === 'all') {
    const rows = await prisma.user.findMany({
      orderBy: { xp: 'desc' },
      take: limit,
      select: { id: true, xp: true, email: true, currentStreak: true },
    });
    topRows = rows.map((r) => ({
      userId: r.id,
      xp: r.xp,
      email: r.email,
      currentStreak: r.currentStreak,
    }));
  } else {
    const topUserIds = Array.from(xpByUser.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([uid]) => uid);
    if (topUserIds.length === 0) {
      topRows = [];
    } else {
      const users = await prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: { id: true, xp: true, email: true, currentStreak: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      topRows = topUserIds
        .map((uid) => userMap.get(uid))
        .filter((u): u is NonNullable<typeof u> => u != null)
        .map((u) => ({
          userId: u.id,
          xp: xpByUser.get(u.id) ?? 0,
          email: u.email,
          currentStreak: u.currentStreak,
        }));
    }
  }

  // ── 3. Запись текущего пользователя (если не в топе) ───────────
  const inTopIds = new Set(topRows.map((r) => r.userId));
  let currentUserEntry: LeaderboardEntry | null = null;

  if (!inTopIds.has(userId)) {
    if (period === 'all') {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { xp: true, email: true, currentStreak: true },
      });
      if (me) {
        const better = await prisma.user.count({ where: { xp: { gt: me.xp } } });
        currentUserEntry = {
          rank: better + 1,
          userId,
          displayName: maskEmail(me.email),
          xp: me.xp,
          currentStreak: me.currentStreak,
          isCurrentUser: true,
        };
      }
    } else {
      const myXp = xpByUser.get(userId) ?? 0;
      if (myXp > 0) {
        const me = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, currentStreak: true },
        });
        if (me) {
          currentUserEntry = {
            rank: computeRank(myXp, xpByUser),
            userId,
            displayName: maskEmail(me.email),
            xp: myXp,
            currentStreak: me.currentStreak,
            isCurrentUser: true,
          };
        }
      }
    }
  }

  // ── 4. Подсчёт total ────────────────────────────────────────────
  const total = period === 'all' ? await prisma.user.count() : xpByUser.size;

  // ── 5. Сборка entries ──────────────────────────────────────────
  const entries: LeaderboardEntry[] = topRows.map((r, idx) => ({
    rank: idx + 1,
    userId: r.userId,
    displayName: maskEmail(r.email),
    xp: r.xp,
    currentStreak: r.currentStreak,
    isCurrentUser: r.userId === userId,
  }));

  return {
    period,
    total,
    entries,
    currentUser: currentUserEntry,
    windowStart: weekWindow ? weekWindow.start.toISOString() : null,
    windowEnd: weekWindow ? weekWindow.end.toISOString() : null,
  };
}

export async function getOverview(userId: string) {
  const [user, progressCounts, accuracy] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { xp: true } }),
    prisma.userWordProgress.groupBy({
      by: ['state'],
      where: { userId },
      _count: true,
    }),
    prisma.sessionAnswer.aggregate({
      where: { session: { userId } },
      _avg: { rating: true },
    }),
  ]);

  const stateMap: Record<string, number> = {};
  for (const row of progressCounts) {
    stateMap[row.state] = row._count;
  }

  const totalWords = Object.values(stateMap).reduce((a, b) => a + b, 0);
  const learnedWords = (stateMap.graduated ?? 0) + (stateMap.review ?? 0);
  const avgRating = accuracy._avg.rating ?? 0;
  // Конвертируем средний рейтинг (1-4) в процент точности
  const accuracyPercent = avgRating > 0 ? Math.round((avgRating / 4) * 100) : 0;

  const { currentStreak } = await getUserStreak(userId);

  return {
    xp: user?.xp ?? 0,
    currentStreak,
    totalWords,
    learnedWords,
    accuracy: accuracyPercent,
    byState: {
      new: stateMap.new ?? 0,
      learning: stateMap.learning ?? 0,
      review: stateMap.review ?? 0,
      graduated: stateMap.graduated ?? 0,
    },
  };
}

/**
 * Возвращает [start, end) UTC для текущего календарного дня.
 * Чистая функция — покрыта юнит-тестами.
 */
export function getTodayUtcRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Считает количество ответов пользователя за текущий календарный день (UTC).
 * Используется в `getDashboard` для кольцевого прогресса ежедневной цели.
 */
export async function countTodayReviews(userId: string, now: Date = new Date()): Promise<number> {
  const { start, end } = getTodayUtcRange(now);
  return prisma.sessionAnswer.count({
    where: {
      session: { userId },
      answeredAt: { gte: start, lt: end },
    },
  });
}

export async function getDashboard(userId: string) {
  const [user, progressCounts, totalReviews] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, dailyGoal: true },
    }),
    prisma.userWordProgress.groupBy({
      by: ['state'],
      where: { userId },
      _count: true,
    }),
    prisma.sessionAnswer.count({
      where: { session: { userId } },
    }),
  ]);

  const stateMap: Record<string, number> = {};
  for (const row of progressCounts) {
    stateMap[row.state] = row._count;
  }

  const wordsLearned = (stateMap.graduated ?? 0) + (stateMap.review ?? 0);
  const xp = user?.xp ?? 0;
  // Если у пользователя почему-то dailyGoal == 0 (не должно быть благодаря
  // Prisma @default(20), но null-страховка не мешает) — отдаём дефолт.
  const dailyGoal = user?.dailyGoal && user.dailyGoal > 0 ? user.dailyGoal : DAILY_GOAL_DEFAULT;

  // Слова, которые нужно повторить сегодня: только learning/review, без новых слов.
  const now = new Date();
  const [wordsDueToday, todayReviews] = await Promise.all([
    prisma.userWordProgress.count({
      where: {
        userId,
        dueDate: { lte: now },
        state: { in: ['learning', 'review'] },
      },
    }),
    countTodayReviews(userId, now),
  ]);

  const { currentStreak } = await getUserStreak(userId);

  return {
    streak: currentStreak,
    wordsDueToday,
    wordsLearned,
    totalReviews,
    todayReviews,
    dailyGoal,
    xp,
  };
}

export async function resetProgress(userId: string) {
  await prisma.$transaction([
    prisma.sessionAnswer.deleteMany({ where: { session: { userId } } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.userWordProgress.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        xp: 0,
        currentStreak: 0,
        lastActiveDate: null,
      },
    }),
  ]);

  return { reset: true };
}

export async function getActivityData(userId: string, year: number, month?: number) {
  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = month
    ? new Date(Date.UTC(year, month, 0, 23, 59, 59))
    : new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const answers = await prisma.sessionAnswer.findMany({
    where: {
      session: { userId },
      answeredAt: { gte: startDate, lte: endDate },
    },
    select: { answeredAt: true },
  });

  // Группируем по дням
  const activityMap = new Map<string, number>();
  for (const a of answers) {
    const date = a.answeredAt.toISOString().slice(0, 10);
    activityMap.set(date, (activityMap.get(date) ?? 0) + 1);
  }

  return Array.from(activityMap.entries()).map(([date, count]) => ({
    date,
    count,
  }));
}

// ═══════════════════════════════════════════════════════════════════
// Карта изучения (PLAN_Features_v0.3 §5)
// ═══════════════════════════════════════════════════════════════════

/**
 * Чистая функция: считает процент «изученности» по одной колоде.
 * Возвращает 0 для пустой колоды (totalWords = 0) — делить на 0 нельзя,
 * а пустая колода визуально ничтожна. `learnedWords` ограничивается
 * `totalWords` на случай рассинхрона данных.
 */
export function computeDeckProgressPercentage(
  totalWords: number,
  learnedWords: number,
): number {
  if (totalWords <= 0) return 0;
  const safe = Math.max(0, Math.min(learnedWords, totalWords));
  return Math.round((safe / totalWords) * 100);
}

/**
 * Возвращает «карту изучения» — прогресс пользователя по каждой колоде
 * (системные HSK + кастомные), отсортированный: сначала системные
 * (HSK 1..6), потом кастомные по имени; внутри групп — по убыванию
 * процента изученности (самые изученные сверху).
 *
 * Для каждой колоды:
 *   totalWords   = число DeckWord в колоде
 *   learnedWords = число UserWordProgress этого пользователя со
 *                  state = 'graduated' (см. примечание в stats.ts
 *                  — это согласовано с «освоенными» в общей статистике)
 *   percentage   = round(learned / total * 100), 0 если total = 0
 *   color        = low / medium / high / complete (пороги 25/50/75)
 *
 * Агрегированные поля:
 *   totalWords       = сумма totalWords по всем колодам
 *   totalLearned     = сумма learnedWords
 *   overallPercentage = round(totalLearned / totalWords * 100), 0
 *                       если totalWords = 0
 */
export async function getStudyMap(userId: string): Promise<StudyMapResponse> {
  // 1. Все колоды (системные + кастомные).
  //    Сортировка: сначала системные (HSK), потом по имени.
  const decks = await prisma.deck.findMany({
    select: {
      id: true,
      name: true,
      isSystemDeck: true,
      _count: { select: { words: true } },
    },
    orderBy: [{ isSystemDeck: 'desc' }, { name: 'asc' }],
  });

  if (decks.length === 0) {
    return { decks: [], totalWords: 0, totalLearned: 0, overallPercentage: 0 };
  }

  // 2. Подсчёт `graduated` для всех колод одним запросом.
  //    Берём все DeckWord колод пользователя и джойним с прогрессом
  //    по (userId, wordId) со state = 'graduated'. Группируем по deckId.
  const deckIds = decks.map((d) => d.id);
  const graduatedRows = await prisma.deckWord.findMany({
    where: {
      deckId: { in: deckIds },
      word: {
        progress: {
          some: { userId, state: 'graduated' },
        },
      },
    },
    select: { deckId: true },
  });
  const graduatedByDeck = new Map<string, number>();
  for (const row of graduatedRows) {
    graduatedByDeck.set(row.deckId, (graduatedByDeck.get(row.deckId) ?? 0) + 1);
  }

  // 3. Сборка DeckProgress[] + сортировка внутри групп.
  const progressList: DeckProgress[] = decks.map((d) => {
    const totalWords = d._count.words;
    const learnedWords = graduatedByDeck.get(d.id) ?? 0;
    const percentage = computeDeckProgressPercentage(totalWords, learnedWords);
    const color: DeckProgressColor = getDeckProgressColor(percentage);
    return {
      deckId: d.id,
      deckName: d.name,
      isSystemDeck: d.isSystemDeck,
      totalWords,
      learnedWords,
      percentage,
      color,
    };
  });

  // Внутри групп (system / custom) — по убыванию процента,
  // затем по имени для стабильности.
  progressList.sort((a, b) => {
    if (a.isSystemDeck !== b.isSystemDeck) {
      return a.isSystemDeck ? -1 : 1;
    }
    if (a.percentage !== b.percentage) return b.percentage - a.percentage;
    return a.deckName.localeCompare(b.deckName);
  });

  // 4. Агрегаты.
  const totalWords = progressList.reduce((s, d) => s + d.totalWords, 0);
  const totalLearned = progressList.reduce((s, d) => s + d.learnedWords, 0);
  const overallPercentage = computeDeckProgressPercentage(totalWords, totalLearned);

  return { decks: progressList, totalWords, totalLearned, overallPercentage };
}

/**
 * Computes and updates the user's daily streak based on lastActiveDate.
 * Called every time the user is active today (e.g. visits the app).
 *
 * Logic:
 * - lastActiveDate is null (never active)      → streak = 1, set lastActiveDate = today
 * - today === lastActiveDate (already counted)  → streak unchanged, no DB update
 * - today === lastActiveDate + 1 (consecutive)  → streak = currentStreak + 1
 * - gap > 1 day (streak broken)                 → streak = 1 (new streak)
 */
export async function getUserStreak(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, lastActiveDate: true },
  });

  const currentStreak = user?.currentStreak ?? 0;
  const rawLastActive = user?.lastActiveDate ?? null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let newStreak = currentStreak;
  let lastActiveDay: Date | null = rawLastActive ? new Date(rawLastActive) : null;
  if (lastActiveDay) lastActiveDay.setUTCHours(0, 0, 0, 0);

  const MS_PER_DAY = 86_400_000;

  if (!lastActiveDay) {
    // Never active before — start streak at 1
    newStreak = 1;
  } else {
    const diffDays = Math.floor((today.getTime() - lastActiveDay.getTime()) / MS_PER_DAY);

    if (diffDays === 0) {
      // Already counted today — no change, no update
      return { currentStreak: newStreak, lastActiveDate: rawLastActive };
    } else if (diffDays === 1) {
      // Consecutive day — increment streak
      newStreak = currentStreak + 1;
    } else {
      // Gap > 1 day — streak broken, start new one
      newStreak = 1;
    }
  }

  // Persist the updated streak and lastActiveDate
  await prisma.user.update({
    where: { id: userId },
    data: {
      currentStreak: newStreak,
      lastActiveDate: today,
    },
  });

  return { currentStreak: newStreak, lastActiveDate: today.toISOString() };
}

// ═══════════════════════════════════════════════════════════════════
// Экспорт/импорт прогресса (PLAN_Features_v0.2 §10)
// ═══════════════════════════════════════════════════════════════════

/**
 * CSV-заголовок для экспорта прогресса. Имена колонок совпадают
 * с полями `ProgressRecordSchema` (camelCase) и используются
 * парсером в `parseProgressCsv` (только на стороне клиента/тестов).
 */
export const PROGRESS_CSV_HEADER =
  'wordId,state,stability,difficulty,reps,dueDate,lastReviewDate';

/**
 * Экранирует значение для CSV-строки. Если значение содержит
 * запятую, кавычку или перевод строки — оборачивает в двойные
 * кавычки и удваивает внутренние кавычки (RFC 4180).
 */
export function escapeCsvField(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.length === 0) return '';
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Конвертирует ISO-дату в короткую форму (без миллисекунд и Z),
 * чтобы CSV был компактнее. Если значение некорректное — отдаёт
 * как есть (для диагностики при импорте).
 */
function shortIso(value: Date | null | undefined): string {
  if (!value) return '';
  try {
    return value.toISOString();
  } catch {
    return '';
  }
}

/**
 * Конвертирует список записей прогресса в CSV-строку с заголовком.
 * Чистая функция — покрыта юнит-тестами.
 */
export function toProgressCsv(records: ProgressRecord[]): string {
  const lines: string[] = [PROGRESS_CSV_HEADER];
  for (const r of records) {
    lines.push(
      [
        escapeCsvField(r.wordId),
        escapeCsvField(r.state),
        escapeCsvField(r.stability),
        escapeCsvField(r.difficulty),
        escapeCsvField(r.reps),
        escapeCsvField(r.dueDate),
        escapeCsvField(r.lastReviewDate ?? ''),
      ].join(','),
    );
  }
  return lines.join('\n');
}

/**
 * Парсит CSV-строку в `ProgressRecord[]`. Только для тестов и
 * одноразовых утилит — основной импорт работает с JSON-форматом.
 * Чистая функция.
 *
 * Бросает Error с понятным сообщением, если формат неверный.
 */
export function parseProgressCsv(csv: string): ProgressRecord[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  if (lines[0] !== PROGRESS_CSV_HEADER) {
    throw new Error(
      `CSV header mismatch: expected "${PROGRESS_CSV_HEADER}", got "${lines[0]}"`,
    );
  }

  const out: ProgressRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    // Простое разделение по запятой — поля экспортируются
    // через `escapeCsvField`, поэтому wordId (uuid) и state
    // (короткое слово) никогда не содержат запятую.
    const parts = line.split(',');
    if (parts.length !== 7) {
      throw new Error(`CSV row ${i + 1}: expected 7 columns, got ${parts.length}`);
    }
    const wordId = parts[0] ?? '';
    const state = (parts[1] ?? 'new') as ProgressRecord['state'];
    const stability = Number(parts[2]);
    const difficulty = Number(parts[3]);
    const reps = Number(parts[4]);
    const dueDate = parts[5] ?? '';
    const lastReviewDate = parts[6] ?? '';
    out.push({
      wordId,
      state,
      stability,
      difficulty,
      reps,
      dueDate,
      lastReviewDate: lastReviewDate === '' ? null : lastReviewDate,
    });
  }
  return out;
}

/**
 * Собирает полный снэпшот прогресса пользователя в JSON-формате
 * `ProgressExport`. Используется в `GET /stats/export?format=json`.
 */
export async function buildProgressExport(userId: string): Promise<ProgressExport> {
  const rows = await prisma.userWordProgress.findMany({
    where: { userId },
    select: {
      wordId: true,
      state: true,
      stability: true,
      difficulty: true,
      reps: true,
      dueDate: true,
      lastReviewDate: true,
    },
    orderBy: { wordId: 'asc' },
  });

  const progress: ProgressRecord[] = rows.map((r) => ({
    wordId: r.wordId,
    state: r.state as ProgressRecord['state'],
    stability: r.stability,
    difficulty: r.difficulty,
    reps: r.reps,
    dueDate: shortIso(r.dueDate),
    lastReviewDate: shortIso(r.lastReviewDate),
  }));

  return {
    version: PROGRESS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    userId,
    progress,
  };
}

/**
 * Применяет импорт прогресса. В режиме `replace` сначала удаляет
 * весь текущий прогресс пользователя, потом вставляет новые записи.
 * В режиме `merge` — обновляет существующие и добавляет новые.
 *
 * Записи с `wordId`, которых нет в таблице `Word`, молча
 * пропускаются (считаются в `skipped`). Это защищает от
 * импорта устаревших бэкапов после удаления словаря.
 */
export async function applyProgressImport(
  userId: string,
  mode: ProgressImportMode,
  records: ProgressRecord[],
): Promise<ProgressImportResponse> {
  // 1. Собираем уникальные wordId из импорта и проверяем их существование.
  const wordIds = Array.from(new Set(records.map((r) => r.wordId)));
  const existingWords = wordIds.length
    ? await prisma.word.findMany({
        where: { id: { in: wordIds } },
        select: { id: true },
      })
    : [];
  const knownWordIds = new Set(existingWords.map((w) => w.id));

  // 2. Фильтруем записи — отбрасываем неизвестные слова.
  const validRecords = records.filter((r) => knownWordIds.has(r.wordId));
  const skipped = records.length - validRecords.length;

  // 3. Смотрим, какие записи уже есть у пользователя.
  const existingProgress = validRecords.length
    ? await prisma.userWordProgress.findMany({
        where: {
          userId,
          wordId: { in: validRecords.map((r) => r.wordId) },
        },
        select: { wordId: true },
      })
    : [];
  const existingSet = new Set(existingProgress.map((p) => p.wordId));

  let imported = 0;
  let updated = 0;

  // 4. Транзакция: `replace` чистит старые записи, потом upsert'ы.
  await prisma.$transaction(async (tx) => {
    if (mode === 'replace') {
      await tx.userWordProgress.deleteMany({ where: { userId } });
    }

    for (const r of validRecords) {
      const exists = existingSet.has(r.wordId);
      if (mode === 'replace' || !exists) {
        await tx.userWordProgress.create({
          data: {
            userId,
            wordId: r.wordId,
            state: r.state,
            stability: r.stability,
            difficulty: r.difficulty,
            reps: r.reps,
            dueDate: new Date(r.dueDate),
            lastReviewDate: r.lastReviewDate ? new Date(r.lastReviewDate) : null,
          },
        });
        imported += 1;
      } else {
        // merge + запись уже есть → обновляем поля.
        await tx.userWordProgress.update({
          where: { userId_wordId: { userId, wordId: r.wordId } },
          data: {
            state: r.state,
            stability: r.stability,
            difficulty: r.difficulty,
            reps: r.reps,
            dueDate: new Date(r.dueDate),
            lastReviewDate: r.lastReviewDate ? new Date(r.lastReviewDate) : null,
          },
        });
        updated += 1;
      }
    }
  });

  return {
    mode,
    total: records.length,
    imported,
    updated,
    skipped,
    importedAt: new Date().toISOString(),
  };
}
