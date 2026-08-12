export function formatCalendarDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function getDaysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function getDayOfYear(year: number, month: number, day: number): number {
  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const daysBeforeMonth = monthLengths
    .slice(0, month)
    .reduce((total, monthLength) => total + monthLength, 0);
  const leapDay = month > 1 && isLeapYear(year) ? 1 : 0;
  return daysBeforeMonth + day - 1 + leapDay;
}

export function formatCalendarDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dateKey}T12:00:00`));
}

export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

/** День в формате `react-activity-calendar` (Activity). */
export interface CalendarActivity {
  date: string;
  count: number;
  level: ActivityLevel;
}

/** Запись активности из API: `{ date: 'YYYY-MM-DD', count }`. */
export interface ActivityDayInput {
  date: string;
  count: number;
}

/** Порог: 0 / 1-5 / 6-15 / 16-30 / 30+. */
export function getActivityLevel(count: number): ActivityLevel {
  if (count <= 0) return 0;
  if (count <= 5) return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

/**
 * Строит полный массив дней года по активности из API: каждая дата года
 * от 1 января до 31 декабря, по возрастанию, с уровнем интенсивности.
 * Дубликаты схлопываются (побеждает последний), даты вне года игнорируются.
 */
export function buildActivityCalendar(
  activity: readonly ActivityDayInput[],
  year: number,
): CalendarActivity[] {
  const prefix = `${year}-`;
  const countsByDate = new Map<string, number>();
  for (const day of activity) {
    if (day.date.startsWith(prefix)) {
      countsByDate.set(day.date, day.count);
    }
  }
  const days = getDaysInYear(year);
  const result: CalendarActivity[] = [];
  const cursor = new Date(year, 0, 1);
  for (let i = 0; i < days; i++) {
    const date = formatCalendarDateKey(cursor);
    const count = countsByDate.get(date) ?? 0;
    result.push({ date, count, level: getActivityLevel(count) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

/** Русская плюрализация: `[одна, несколько, много]` (1 / 2-4 / 5+). */
export function pluralizeRussian(
  count: number,
  forms: readonly [one: string, few: string, many: string],
): string {
  const [one, few, many] = forms;
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (last === 1 && n !== 11) return one;
  if (last >= 2 && last <= 4 && (n < 12 || n > 14)) return few;
  return many;
}

/** Копия для тултипов: «5 занятий». */
export function formatActivityCount(count: number): string {
  return `${count} ${pluralizeRussian(count, ['занятие', 'занятия', 'занятий'])}`;
}
