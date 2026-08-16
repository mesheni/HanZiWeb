import { prisma } from '../../lib/prisma.js';
import { deckAccessWhere } from '../../lib/deckAccess.js';
import type { Prisma } from '@prisma/client';
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
    prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, streakFreezeCount: true },
    }),
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
    streakFreezeCount: user?.streakFreezeCount ?? 0,
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
 * Возвращает ключ локального дня (YYYY-MM-DD) для `date` в IANA `timezone`.
 * Чистая функция — покрыта юнит-тестами. Использует `Intl.DateTimeFormat`
 * (встроен в Node, корректно обрабатывает DST).
 *
 * Примеры (2026-07-15T23:30:00.000Z):
 *   getLocalDayKey(d, 'UTC')         === '2026-07-15'
 *   getLocalDayKey(d, 'Europe/Moscow') === '2026-07-16'  (UTC+3)
 *   getLocalDayKey(d, 'America/Los_Angeles') === '2026-07-15' (UTC-7, DST)
 */
export function getLocalDayKey(date: Date, timezone: string = 'UTC'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Считает разницу в календарных днях между двумя ключами YYYY-MM-DD.
 * `b - a`, может быть отрицательной. Чистая функция.
 *
 * Парсим как UTC-даты, потому что нас интересует РАЗНИЦА календарных
 * дней, а не длительность (24 vs 23/25 часов физического времени при
 * DST). Используется в `getUserStreak` для сравнения локальных дней.
 */
/**
 * Считает разницу в календарных днях между двумя ключами YYYY-MM-DD.
 * `b - a`, может быть отрицательной. Чистая функция, экспортируется
 * для тестов.
 *
 * Парсим как UTC-даты, потому что нас интересует РАЗНИЦА календарных
 * дней, а не длительность (24 vs 23/25 часов физического времени при
 * DST). Используется в `getUserStreak` для сравнения локальных дней.
 */
export function daysBetweenKeys(a: string, b: string): number {
  const pa = a.split('-');
  const pb = b.split('-');
  if (pa.length !== 3 || pb.length !== 3) {
    throw new Error(`Invalid day key: ${a} / ${b}`);
  }
  const ya = Number(pa[0]);
  const ma = Number(pa[1]);
  const da = Number(pa[2]);
  const yb = Number(pb[0]);
  const mb = Number(pb[1]);
  const db = Number(pb[2]);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/**
 * Возвращает смещение в мс для `timezone` в момент `utc`.
 * Положительное = tz впереди UTC. Чистая функция.
 * Используется для перевода «локальная полночь YYYY-MM-DD» в UTC Date.
 */
function tzOffsetMsAt(utc: Date, timezone: string): number {
  if (timezone === 'UTC') return 0;
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(utc)) parts[p.type] = p.value;
  const get = (t: string): number => {
    const raw = parts[t];
    if (raw === undefined) throw new Error(`Intl.DateTimeFormat: missing part ${t}`);
    return Number(raw);
  };
  // `Intl` отдаёт '24' для полуночи в режиме hour12=false — нормализуем.
  const hour = parts.hour === '24' ? 0 : get('hour');
  const asLocalUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  return asLocalUtc - utc.getTime();
}

/**
 * Возвращает UTC Date локальной полуночи КАЛЕНДАРНОЙ даты (year, month, day)
 * в `timezone` — обратная операция к `getLocalDayKey`. Не зависит от того,
 * в какой локальный день попадает какой-либо UTC-инстант: граница
 * привязывается к локальному календарю напрямую.
 *
 * Нужен для окон активности (F13): `localMidnightUtc(new Date(Date.UTC(y,0,1)))`
 * для negative-offset зон (America/Los_Angeles) возвращал полночь ПРЕДЫДУЩЕГО
 * локального дня (инстант 1 января 00:00 UTC там — ещё 31 декабря) — окно
 * года сдвигалось на день: включало 31.12 прошлого года и теряло 31.12
 * текущего. Чистая функция.
 */
function localMidnightUtcForYmd(year: number, month: number, day: number, timezone: string): Date {
  if (timezone === 'UTC') {
    return new Date(Date.UTC(year, month - 1, day));
  }
  // Date.UTC сам переводит переполнение календаря (например, 32 февраля →
  // 4 марта, месяц 13 → январь следующего года).
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  // tz-offset в точке guess — аппроксимация для offset в точке localMidnight.
  // Корректно для всех случаев кроме самого момента DST-перехода
  // (когда смещение меняется на ±1ч). В этом случае оффсет
  // переключается в 02:00–03:00 локального времени, что не задевает
  // локальную полночь (00:00).
  const offset = tzOffsetMsAt(new Date(guess), timezone);
  return new Date(guess - offset);
}

/**
 * Возвращает UTC Date, соответствующий локальной полуночи того дня,
 * в котором находится `date` в `timezone` (или `dayOffset` календарных
 * дней спустя — для вычисления «следующей полуночи» в getTodayUtcRange).
 * Чистая функция.
 *
 * Пример (date = 2026-07-15T20:00:00.000Z):
 *   localMidnightUtc(d, 'Europe/Moscow') === Date('2026-07-15T21:00:00.000Z')
 *     // 00:00 в Москве = 21:00 UTC предыдущего дня (логически того же)
 *   localMidnightUtc(d, 'UTC')           === Date('2026-07-15T00:00:00.000Z')
 */
function localMidnightUtc(date: Date, timezone: string, dayOffset = 0): Date {
  if (timezone === 'UTC') {
    const out = new Date(date);
    out.setUTCHours(0, 0, 0, 0);
    if (dayOffset !== 0) out.setUTCDate(out.getUTCDate() + dayOffset);
    return out;
  }
  const dayKey = getLocalDayKey(date, timezone);
  const ymd = dayKey.split('-');
  if (ymd.length !== 3) {
    throw new Error(`Invalid day key from Intl: ${dayKey}`);
  }
  const y = Number(ymd[0]);
  const m = Number(ymd[1]);
  const d = Number(ymd[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid day key from Intl: ${dayKey}`);
  }
  return localMidnightUtcForYmd(y, m, d + dayOffset, timezone);
}

/**
 * Возвращает [start, end) UTC для текущего календарного дня в `timezone`.
 * Чистая функция — покрыта юнит-тестами. Backward-compat: при `timezone='UTC'`
 * поведение идентично прежнему (для уже существующих тестов).
 *
 * Используется daily-статистикой (`countTodayReviews`, getUserStreak) и
 * теперь учитывает локальный календарь пользователя вместо UTC
 * (PLAN_Features_v0.4 §24).
 */
export function getTodayUtcRange(
  now: Date = new Date(),
  timezone: string = 'UTC',
): { start: Date; end: Date } {
  if (timezone === 'UTC') {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  const start = localMidnightUtc(now, timezone);
  // Конец окна — следующая ЛОКАЛЬНАЯ полночь, а не start + 24ч
  // (PLANCorrection #14): в дни DST-перехода локальные сутки длятся
  // 23/25 часов, и фиксированное 24h-окно захватывало лишний час
  // следующего локального дня (весна) или теряло последний час
  // текущего (осень) — daily-прогресс и countTodayReviews съезжали.
  const end = localMidnightUtc(now, timezone, 1);
  return { start, end };
}

/**
 * Считает количество ответов пользователя за текущий локальный календарный
 * день (в timezone пользователя). Используется в `getDashboard` для
 * кольцевого прогресса ежедневной цели. PLAN_Features_v0.4 §24.
 */
export async function countTodayReviews(userId: string, now: Date = new Date()): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone ?? 'UTC';
  const { start, end } = getTodayUtcRange(now, tz);
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

  const { currentStreak, streakFreezeCount } = await getUserStreak(userId);

  return {
    streak: currentStreak,
    streakFreezeCount,
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
    // F16: «полный» сброс не чистил cloze-статистику и достижения —
    // бейджи и ClozeProgress переживали сброс прогресса.
    prisma.clozeProgress.deleteMany({ where: { userId } }),
    prisma.userAchievement.deleteMany({ where: { userId } }),
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timezone = user?.timezone ?? 'UTC';

  // Окно выборки строим по ЛОКАЛЬНОМУ календарю пользователя (F13).
  // Для пользователя в Europe/Moscow год 2026 начинается в 2025-12-31T21:00Z
  // и заканчивается в 2027-01-01T00:00Z — фиксированный «календарный»
  // год в UTC отрезал бы ответы за 00:00..02:59 локального 1 января
  // (PLAN_Features_v0.4 §25). Аналогично для месяца: конец июля = 1 августа.
  // До фикса границы считались через `localMidnightUtc(Jan 1 00:00Z)`,
  // что для negative-offset зон (America/Los_Angeles) давало полночь
  // ПРЕДЫДУЩЕГО локального дня (инстант 00:00 UTC 1 января там — ещё
  // 31 декабря): окно года сдвигалось на день — ответы 31 декабря
  // текущего года терялись, а 31 декабря прошлого попадали в год.
  const endLocalYear = month ? year : year + 1;
  // month=7 → конец июля = 1 августа → endLocalMonth=8. Date.UTC
  // нормализует month=12 → январь следующего года, так что переполнение
  // через 12 безопасно.
  const endLocalMonth = month ? month + 1 : 1;
  const startDate = localMidnightUtcForYmd(year, 1, 1, timezone);
  const endDate = localMidnightUtcForYmd(endLocalYear, endLocalMonth, 1, timezone);

  const answers = await prisma.sessionAnswer.findMany({
    where: {
      session: { userId },
      answeredAt: { gte: startDate, lt: endDate },
    },
    select: { answeredAt: true },
  });

  // Группируем по локальным дням пользователя (а не UTC).
  const activityMap = new Map<string, number>();
  for (const a of answers) {
    const date = getLocalDayKey(a.answeredAt, timezone);
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
export function computeDeckProgressPercentage(totalWords: number, learnedWords: number): number {
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
  // 1. Колоды, доступные пользователю: системные (HSK) + свои кастомные.
  //    Чужие приватные колоды исключены (F02) — до фикса study-map
  //    отдавал ВСЕ колоды, включая чужие.
  //    Сортировка: сначала системные (HSK), потом по имени.
  const decks = await prisma.deck.findMany({
    where: deckAccessWhere(userId),
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
 * Чистая функция: считает daily streak по состоянию `User` и моменту `now`.
 * НЕ пишет в БД — вычисляет, каким был бы стрик при «касании» активности.
 *
 * Логика:
 * - lastActiveDate null (никогда не был активен) → streak = 1, якорь = сегодня
 * - today === lastActiveDate (уже засчитан)      → streak без изменений
 * - today === lastActiveDate + 1 (подряд)        → streak = currentStreak + 1
 * - разрыв > 1 дня (стрик сломан)                → streak = 1 (новый стрик)
 * - lastActiveDate в «будущем» (аномалия/гонка)  → без изменений (не откатываем)
 *
 * Бакетируем через локальный день пользователя, а не UTC-полночь
 * (PLAN_Features_v0.4 §24): для не-UTC юзеров прежняя логика сдвигала
 * «сегодня» на часы и ломала ожидаемый «consecutive local days».
 */
export function computeStreak(
  currentStreak: number,
  lastActiveDate: Date | null,
  now: Date,
  timezone: string,
  freezeCount: number = 0,
): { currentStreak: number; lastActiveDate: Date; freezeConsumed: boolean } {
  const todayKey = getLocalDayKey(now, timezone);
  if (lastActiveDate) {
    const lastKey = getLocalDayKey(lastActiveDate, timezone);
    if (lastKey === todayKey) {
      // Уже засчитан сегодня — без изменений.
      return { currentStreak, lastActiveDate, freezeConsumed: false };
    }
    // Разница в локальных днях (а не UTC-днях). Парсим ключи и считаем
    // календарные дни — корректно даже если между двумя днями есть
    // DST-переход (24 vs 23/25 часов физического времени).
    const dayDiff = daysBetweenKeys(lastKey, todayKey);
    // Отрицательная разница = lastActiveDate в будущем (гонка/аномалия):
    // не откатываем якорь назад (максимум-семантика, PLANCorrection #16).
    if (dayDiff < 0) return { currentStreak, lastActiveDate, freezeConsumed: false };
    const anchor = localMidnightUtc(now, timezone);
    if (dayDiff === 1) {
      return { currentStreak: currentStreak + 1, lastActiveDate: anchor, freezeConsumed: false };
    }
    // Страховка стрика (v0.7): пропуск ровно одного дня (dayDiff === 2)
    // при наличии страховки сохраняет серию; списание выполняет
    // touchStreak по флагу freezeConsumed.
    if (dayDiff === 2 && freezeCount > 0) {
      return { currentStreak: currentStreak + 1, lastActiveDate: anchor, freezeConsumed: true };
    }
    return { currentStreak: 1, lastActiveDate: anchor, freezeConsumed: false };
  }
  // Никогда не был активен — начинаем с 1.
  return {
    currentStreak: 1,
    lastActiveDate: localMidnightUtc(now, timezone),
    freezeConsumed: false,
  };
}

/**
 * Читает текущий стрик пользователя и вычисляет его на момент `now`
 * БЕЗ записи в БД. Read-only — просмотр статистики/дашборда не должен
 * засчитываться как активность (F12: «просмотр дашборда обновлял
 * lastActiveDate», а live-ответы — нет).
 */
export async function getUserStreak(userId: string, now: Date = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, lastActiveDate: true, timezone: true, streakFreezeCount: true },
  });
  const streak = computeStreak(
    user?.currentStreak ?? 0,
    user?.lastActiveDate ?? null,
    now,
    user?.timezone ?? 'UTC',
    user?.streakFreezeCount ?? 0,
  );
  return { ...streak, streakFreezeCount: user?.streakFreezeCount ?? 0 };
}

/**
 * «Касание» активности: пересчитывает стрик от текущего состояния и
 * ПЕРСИСТИТ `currentStreak` + `lastActiveDate`. Вызывается только из
 * путей реальной активности — live-ответов (`recordAnswer`) и
 * офлайн-flush (`processSync`), а не из read-эндпоинтов (F12).
 *
 * Запись идёт через `updateMany` с монотонным условием (как в sync-пути,
 * PLANCorrection #16): при конкурентной активности с более поздним
 * `lastActiveDate` запись не откатывает якорь назад.
 *
 * Якорь = локальная полночь в tz как UTC — привязан к календарному дню,
 * и при смене tz пользователем старые данные остаются консистентными
 * (сравнение идёт по ключам).
 */
export async function touchStreak(
  db: Pick<Prisma.TransactionClient, 'user'>,
  userId: string,
  now: Date = new Date(),
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      currentStreak: true,
      lastActiveDate: true,
      timezone: true,
      streakFreezeCount: true,
      lastFreezeGrantAt: true,
    },
  });
  if (!user) {
    return { currentStreak: 0, lastActiveDate: null, freezeConsumed: false, streakFreezeCount: 0 };
  }

  // Начисление страховок (v0.7): 1 за календарный месяц активности,
  // максимум 2 накоплено. Месяц — по серверному календарю; условная
  // запись через updateMany не даёт начислить дважды при гонке.
  let freezeCount = user.streakFreezeCount;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (freezeCount < 2 && (!user.lastFreezeGrantAt || user.lastFreezeGrantAt < monthStart)) {
    const granted = await db.user.updateMany({
      where: {
        id: userId,
        streakFreezeCount: { lt: 2 },
        OR: [{ lastFreezeGrantAt: null }, { lastFreezeGrantAt: { lt: monthStart } }],
      },
      data: { streakFreezeCount: { increment: 1 }, lastFreezeGrantAt: now },
    });
    if (granted.count === 1) freezeCount += 1;
  }

  const next = computeStreak(
    user.currentStreak,
    user.lastActiveDate,
    now,
    user.timezone ?? 'UTC',
    freezeCount,
  );

  // Списание страховки: только когда она реально сохранила серию
  // (dayDiff === 2). Условный decrement защищает от ухода в минус.
  if (next.freezeConsumed) {
    await db.user.updateMany({
      where: { id: userId, streakFreezeCount: { gt: 0 } },
      data: { streakFreezeCount: { decrement: 1 } },
    });
    freezeCount -= 1;
  }

  await db.user.updateMany({
    where: {
      id: userId,
      OR: [{ lastActiveDate: null }, { lastActiveDate: { lt: next.lastActiveDate } }],
    },
    data: { currentStreak: next.currentStreak, lastActiveDate: next.lastActiveDate },
  });
  return { ...next, streakFreezeCount: Math.max(0, freezeCount) };
}

// ═══════════════════════════════════════════════════════════════════
// Экспорт/импорт прогресса (PLAN_Features_v0.2 §10)
// ═══════════════════════════════════════════════════════════════════

/**
 * CSV-заголовок для экспорта прогресса. Имена колонок совпадают
 * с полями `ProgressRecordSchema` (camelCase) и используются
 * парсером в `parseProgressCsv` (только на стороне клиента/тестов).
 */
export const PROGRESS_CSV_HEADER = 'wordId,state,stability,difficulty,reps,dueDate,lastReviewDate';

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
    throw new Error(`CSV header mismatch: expected "${PROGRESS_CSV_HEADER}", got "${lines[0]}"`);
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
