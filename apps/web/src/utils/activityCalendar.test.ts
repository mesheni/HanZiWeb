// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildActivityCalendar,
  formatActivityCount,
  formatCalendarDateKey,
  formatCalendarDateLabel,
  getActivityLevel,
  getDayOfYear,
  getDaysInYear,
  pluralizeRussian,
} from './activityCalendar';

describe('formatCalendarDateKey', () => {
  it('keeps January 1 in the requested local calendar year', () => {
    expect(formatCalendarDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('zero-pads month and day', () => {
    expect(formatCalendarDateKey(new Date(2024, 11, 5))).toBe('2024-12-05');
  });
});

describe('formatCalendarDateLabel', () => {
  it('formats a date key without shifting it to the previous day', () => {
    expect(formatCalendarDateLabel('2026-01-01')).toBe('1 января');
  });
});

describe('year length helpers', () => {
  it('counts days per year, leap day keeps calendar offsets', () => {
    expect(getDaysInYear(2023)).toBe(365);
    expect(getDaysInYear(2024)).toBe(366);
    expect(getDayOfYear(2024, 1, 29)).toBe(59);
    expect(getDayOfYear(2024, 2, 1)).toBe(60);
  });
});

describe('getActivityLevel', () => {
  it('maps counts to levels 0 / 1-5 / 6-15 / 16-30 / 30+', () => {
    expect(getActivityLevel(0)).toBe(0);
    expect(getActivityLevel(1)).toBe(1);
    expect(getActivityLevel(5)).toBe(1);
    expect(getActivityLevel(6)).toBe(2);
    expect(getActivityLevel(15)).toBe(2);
    expect(getActivityLevel(16)).toBe(3);
    expect(getActivityLevel(30)).toBe(3);
    expect(getActivityLevel(31)).toBe(4);
    expect(getActivityLevel(100)).toBe(4);
  });
});

describe('buildActivityCalendar', () => {
  it('covers every day of a leap year ascending with zero levels when empty', () => {
    const days = buildActivityCalendar([], 2024);
    expect(days).toHaveLength(366);
    expect(days[0]).toEqual({ date: '2024-01-01', count: 0, level: 0 });
    expect(days[59]).toMatchObject({ date: '2024-02-29', count: 0, level: 0 });
    expect(days[365]).toEqual({ date: '2024-12-31', count: 0, level: 0 });
    const keys = days.map((day) => day.date);
    expect([...keys].sort()).toEqual(keys);
  });

  it('returns 365 entries for a non-leap year', () => {
    expect(buildActivityCalendar([], 2023)).toHaveLength(365);
  });

  it('fills counts and levels from activity days', () => {
    const days = buildActivityCalendar(
      [
        { date: '2024-06-01', count: 3 },
        { date: '2024-06-02', count: 40 },
        { date: '2024-06-03', count: 0 },
      ],
      2024,
    );
    const byDate = new Map(days.map((day) => [day.date, day]));
    expect(byDate.get('2024-06-01')).toEqual({
      date: '2024-06-01',
      count: 3,
      level: 1,
    });
    expect(byDate.get('2024-06-02')).toEqual({
      date: '2024-06-02',
      count: 40,
      level: 4,
    });
    expect(byDate.get('2024-06-03')).toEqual({
      date: '2024-06-03',
      count: 0,
      level: 0,
    });
    expect(byDate.get('2024-06-04')).toEqual({
      date: '2024-06-04',
      count: 0,
      level: 0,
    });
  });

  it('sorts unsorted input and deduplicates by last occurrence', () => {
    const days = buildActivityCalendar(
      [
        { date: '2024-12-31', count: 7 },
        { date: '2024-01-01', count: 2 },
        { date: '2024-07-15', count: 5 },
        { date: '2024-01-01', count: 9 },
      ],
      2024,
    );
    expect(days[0]).toEqual({ date: '2024-01-01', count: 9, level: 2 });
    expect(days[364]).toEqual({ date: '2024-12-30', count: 0, level: 0 });
    expect(days[365]).toEqual({ date: '2024-12-31', count: 7, level: 2 });
  });

  it('ignores activity days outside the requested year', () => {
    const days = buildActivityCalendar(
      [
        { date: '2023-12-31', count: 99 },
        { date: '2024-01-01', count: 2 },
        { date: '2025-01-01', count: 99 },
      ],
      2024,
    );
    expect(days).toHaveLength(366);
    expect(days[0]).toEqual({ date: '2024-01-01', count: 2, level: 1 });
    expect(days[365]).toEqual({ date: '2024-12-31', count: 0, level: 0 });
  });
});

describe('react-activity-calendar data contract', () => {
  it('buildActivityCalendar output satisfies the library Activity requirements', () => {
    const days = buildActivityCalendar(
      [
        { date: '2026-01-05', count: 3 },
        { date: '2026-12-31', count: 40 },
      ],
      2026,
    );
    expect(days.length).toBeGreaterThan(0);
    expect(days[0]).toMatchObject({ date: '2026-01-01', level: 0 });
    expect(days[days.length - 1]).toMatchObject({ date: '2026-12-31' });
    for (const day of days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.count).toBeGreaterThanOrEqual(0);
      expect(day.level).toBeGreaterThanOrEqual(0);
      expect(day.level).toBeLessThanOrEqual(4);
    }
  });

  it('emits no dates outside the requested year (no previous-year cells)', () => {
    const days = buildActivityCalendar([], 2026);
    expect(days[0]?.date).toBe('2026-01-01');
    expect(days.every((day) => day.date.startsWith('2026-'))).toBe(true);
  });
});

describe('pluralizeRussian', () => {
  it('selects one/few/many forms by Russian plural rules', () => {
    const forms = ['занятие', 'занятия', 'занятий'] as const;
    expect(pluralizeRussian(1, forms)).toBe('занятие');
    expect(pluralizeRussian(2, forms)).toBe('занятия');
    expect(pluralizeRussian(5, forms)).toBe('занятий');
    expect(pluralizeRussian(11, forms)).toBe('занятий');
    expect(pluralizeRussian(12, forms)).toBe('занятий');
    expect(pluralizeRussian(21, forms)).toBe('занятие');
    expect(pluralizeRussian(22, forms)).toBe('занятия');
    expect(pluralizeRussian(25, forms)).toBe('занятий');
    expect(pluralizeRussian(0, forms)).toBe('занятий');
  });
});

describe('formatActivityCount', () => {
  it('renders count with a pluralized noun', () => {
    expect(formatActivityCount(1)).toBe('1 занятие');
    expect(formatActivityCount(2)).toBe('2 занятия');
    expect(formatActivityCount(5)).toBe('5 занятий');
    expect(formatActivityCount(21)).toBe('21 занятие');
    expect(formatActivityCount(101)).toBe('101 занятие');
  });
});
