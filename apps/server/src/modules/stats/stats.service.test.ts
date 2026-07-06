import { describe, it, expect } from 'vitest';
import {
  RATING_XP,
  PROGRESS_CSV_HEADER,
  aggregateWeeklyXp,
  computeDeckProgressPercentage,
  computeRank,
  escapeCsvField,
  getCurrentWeekWindow,
  getTodayUtcRange,
  maskEmail,
  parseProgressCsv,
  toProgressCsv,
} from './stats.service.js';
import { getDeckProgressColor } from '@hanzi/shared';
import type { ProgressRecord } from '@hanzi/shared';

describe('RATING_XP', () => {
  it('matches sessions.service.recordAnswer mapping', () => {
    expect(RATING_XP[1]).toBe(0);
    expect(RATING_XP[2]).toBe(1);
    expect(RATING_XP[3]).toBe(3);
    expect(RATING_XP[4]).toBe(5);
  });
});

describe('maskEmail', () => {
  it('masks local part to first 2 chars + ***@domain', () => {
    expect(maskEmail('alice@gmail.com')).toBe('al***@gmail.com');
    expect(maskEmail('verylongname@example.org')).toBe('ve***@example.org');
  });

  it('handles very short local parts', () => {
    expect(maskEmail('a@x.io')).toBe('a***@x.io');
  });

  it('falls back to *** for malformed emails', () => {
    expect(maskEmail('')).toBe('***');
    expect(maskEmail('no-at-sign')).toBe('***');
    expect(maskEmail('@nouser.com')).toBe('***');
    expect(maskEmail('nouser@')).toBe('***');
  });
});

describe('getCurrentWeekWindow', () => {
  it('returns Mon 00:00:00 UTC as start and next Mon as exclusive end', () => {
    // 2026-07-08 — это среда (Wed). Начало недели — Пн 2026-07-06.
    const wed = new Date('2026-07-08T15:30:00.000Z');
    const { start, end } = getCurrentWeekWindow(wed);

    expect(start.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('handles Monday itself (no shift)', () => {
    const mon = new Date('2026-07-06T05:00:00.000Z');
    const { start, end } = getCurrentWeekWindow(mon);
    expect(start.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('handles Sunday (shift back 6 days)', () => {
    const sun = new Date('2026-07-12T20:00:00.000Z');
    const { start, end } = getCurrentWeekWindow(sun);
    expect(start.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('window is exactly 7 days', () => {
    const wed = new Date('2026-07-08T15:30:00.000Z');
    const { start, end } = getCurrentWeekWindow(wed);
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('crosses month boundary correctly', () => {
    // 2026-08-03 — это Пн.
    const mon = new Date('2026-08-03T08:00:00.000Z');
    const { start, end } = getCurrentWeekWindow(mon);
    expect(start.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });
});

describe('aggregateWeeklyXp', () => {
  it('sums XP per userId from rating events', () => {
    const answers = [
      { rating: 3, userId: 'u1' }, // +3
      { rating: 4, userId: 'u1' }, // +5
      { rating: 2, userId: 'u2' }, // +1
      { rating: 1, userId: 'u2' }, // +0
      { rating: 4, userId: 'u3' }, // +5
    ];
    const out = aggregateWeeklyXp(answers);
    expect(out.get('u1')).toBe(8);
    expect(out.get('u2')).toBe(1);
    expect(out.get('u3')).toBe(5);
  });

  it('skips unknown rating values', () => {
    const out = aggregateWeeklyXp([
      { rating: 5, userId: 'u1' },
      { rating: 0, userId: 'u1' },
      { rating: -1, userId: 'u2' },
    ]);
    expect(out.size).toBe(0);
  });

  it('returns empty map for empty input', () => {
    expect(aggregateWeeklyXp([]).size).toBe(0);
  });

  it('handles rating=1 (Again → 0 XP) as no-op', () => {
    const out = aggregateWeeklyXp([{ rating: 1, userId: 'u1' }]);
    expect(out.has('u1')).toBe(false);
  });
});

describe('computeRank', () => {
  it('returns 1 when no one has more XP', () => {
    const map = new Map([
      ['a', 100],
      ['b', 50],
    ]);
    expect(computeRank(200, map)).toBe(1);
  });

  it('counts everyone with strictly greater XP', () => {
    const map = new Map([
      ['a', 300],
      ['b', 200],
      ['c', 100],
    ]);
    // Лучше нас — a (300) и b (200) → rank = 3.
    expect(computeRank(150, map)).toBe(3);
  });

  it('treats equal XP as not-better (position after all greater)', () => {
    const map = new Map([
      ['a', 200],
      ['b', 200],
      ['c', 100],
    ]);
    // Текущий с 200 XP: «лучше» только те, у кого > 200; таких 0 → rank 1.
    expect(computeRank(200, map)).toBe(1);
  });

  it('returns total+1 when no one is better', () => {
    const map = new Map([
      ['a', 100],
      ['b', 50],
    ]);
    expect(computeRank(0, map)).toBe(3);
  });
});

describe('getTodayUtcRange', () => {
  it('возвращает начало текущего дня в UTC и начало следующего', () => {
    const wed = new Date('2026-07-08T15:30:45.123Z');
    const { start, end } = getTodayUtcRange(wed);
    expect(start.toISOString()).toBe('2026-07-08T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-09T00:00:00.000Z');
  });

  it('ровно один день (24 часа)', () => {
    const now = new Date('2026-07-08T15:30:00.000Z');
    const { start, end } = getTodayUtcRange(now);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('окно охватывает всю текущую дату независимо от часа', () => {
    // Полночь UTC — это начало дня, и окно должно указывать на этот же день.
    const midnight = new Date('2026-07-08T00:00:00.000Z');
    const { start, end } = getTodayUtcRange(midnight);
    expect(start.toISOString()).toBe('2026-07-08T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-09T00:00:00.000Z');
  });

  it('переходит через границу месяца', () => {
    const last = new Date('2026-07-31T23:59:59.999Z');
    const { start, end } = getTodayUtcRange(last);
    expect(start.toISOString()).toBe('2026-07-31T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});

// ─── Экспорт/импорт прогресса (PLAN_Features_v0.2 §10) ─────────────

describe('escapeCsvField', () => {
  it('отдаёт пустую строку для null', () => {
    expect(escapeCsvField(null)).toBe('');
  });

  it('не оборачивает простые значения', () => {
    expect(escapeCsvField('uuid-like-value')).toBe('uuid-like-value');
    expect(escapeCsvField(42)).toBe('42');
  });

  it('оборачивает в кавычки значения с запятой, кавычкой или переводом строки', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('he said "hi"')).toBe('"he said ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('toProgressCsv', () => {
  const sampleRecords: ProgressRecord[] = [
    {
      wordId: '11111111-1111-1111-1111-111111111111',
      state: 'learning',
      stability: 1.25,
      difficulty: 5.0,
      reps: 3,
      dueDate: '2026-07-04T12:00:00.000Z',
      lastReviewDate: '2026-07-03T12:00:00.000Z',
    },
    {
      wordId: '22222222-2222-2222-2222-222222222222',
      state: 'graduated',
      stability: 30.5,
      difficulty: 2.1,
      reps: 12,
      dueDate: '2026-08-15T00:00:00.000Z',
      lastReviewDate: null,
    },
  ];

  it('начинается с фиксированного заголовка', () => {
    const csv = toProgressCsv(sampleRecords);
    expect(csv.split('\n')[0]).toBe(PROGRESS_CSV_HEADER);
  });

  it('формирует по одной строке на запись с правильным числом колонок', () => {
    const csv = toProgressCsv(sampleRecords);
    const lines = csv.split('\n');
    expect(lines.length).toBe(3); // header + 2 records
    for (const line of lines.slice(1)) {
      expect(line.split(',').length).toBe(7);
    }
  });

  it('пустой lastReviewDate рендерится как пустая строка', () => {
    const csv = toProgressCsv(sampleRecords);
    const lines = csv.split('\n');
    // Вторая запись — lastReviewDate = null → 7 колонок, последняя пустая.
    const lastLine = lines[2] ?? '';
    const lastLineParts = lastLine.split(',');
    expect(lastLineParts[6]).toBe('');
  });

  it('возвращает только заголовок для пустого массива', () => {
    const csv = toProgressCsv([]);
    expect(csv).toBe(PROGRESS_CSV_HEADER);
  });
});

describe('parseProgressCsv', () => {
  it('парсит CSV обратно в массив ProgressRecord', () => {
    const original: ProgressRecord[] = [
      {
        wordId: '11111111-1111-1111-1111-111111111111',
        state: 'review',
        stability: 7.5,
        difficulty: 3.2,
        reps: 5,
        dueDate: '2026-07-04T12:00:00.000Z',
        lastReviewDate: '2026-07-03T12:00:00.000Z',
      },
      {
        wordId: '22222222-2222-2222-2222-222222222222',
        state: 'new',
        stability: 0,
        difficulty: 0,
        reps: 0,
        dueDate: '2026-07-04T00:00:00.000Z',
        lastReviewDate: null,
      },
    ];
    const csv = toProgressCsv(original);
    const parsed = parseProgressCsv(csv);
    expect(parsed).toEqual(original);
  });

  it('бросает ошибку на неверный заголовок', () => {
    expect(() => parseProgressCsv('foo,bar\n1,2')).toThrow(/CSV header mismatch/);
  });

  it('бросает ошибку при неверном числе колонок', () => {
    const bad = `${PROGRESS_CSV_HEADER}\nonly,three,cols`;
    expect(() => parseProgressCsv(bad)).toThrow(/expected 7 columns/);
  });

  it('возвращает пустой массив для пустой строки', () => {
    expect(parseProgressCsv('')).toEqual([]);
  });
});

// ─── Карта изучения (PLAN_Features_v0.3 §5) ──────────────────────

describe('computeDeckProgressPercentage', () => {
  it('возвращает 0 для пустой колоды (нет слов)', () => {
    expect(computeDeckProgressPercentage(0, 0)).toBe(0);
    expect(computeDeckProgressPercentage(0, 5)).toBe(0);
  });

  it('возвращает 0 если ни одно слово не изучено', () => {
    expect(computeDeckProgressPercentage(50, 0)).toBe(0);
  });

  it('возвращает 100 если все слова изучены', () => {
    expect(computeDeckProgressPercentage(20, 20)).toBe(100);
  });

  it('округляет процент до целого', () => {
    // 1/3 ≈ 33.33 → 33
    expect(computeDeckProgressPercentage(3, 1)).toBe(33);
    // 2/3 ≈ 66.66 → 67
    expect(computeDeckProgressPercentage(3, 2)).toBe(67);
  });

  it('обрабатывает промежуточные значения', () => {
    expect(computeDeckProgressPercentage(100, 25)).toBe(25);
    expect(computeDeckProgressPercentage(100, 50)).toBe(50);
    expect(computeDeckProgressPercentage(100, 75)).toBe(75);
  });

  it('ограничивает learnedWords до totalWords (защита от рассинхрона)', () => {
    // Если почему-то learned > total, не должен выдавать > 100.
    expect(computeDeckProgressPercentage(10, 15)).toBe(100);
  });

  it('отрицательные значения дают 0', () => {
    expect(computeDeckProgressPercentage(10, -3)).toBe(0);
  });
});

describe('getDeckProgressColor', () => {
  it('0% → low', () => {
    expect(getDeckProgressColor(0)).toBe('low');
  });

  it('ровно граница 24% → ещё low', () => {
    expect(getDeckProgressColor(24)).toBe('low');
  });

  it('25% → medium', () => {
    expect(getDeckProgressColor(25)).toBe('medium');
  });

  it('49% → medium', () => {
    expect(getDeckProgressColor(49)).toBe('medium');
  });

  it('50% → high', () => {
    expect(getDeckProgressColor(50)).toBe('high');
  });

  it('74% → high', () => {
    expect(getDeckProgressColor(74)).toBe('high');
  });

  it('75% → complete', () => {
    expect(getDeckProgressColor(75)).toBe('complete');
  });

  it('100% → complete', () => {
    expect(getDeckProgressColor(100)).toBe('complete');
  });
});
