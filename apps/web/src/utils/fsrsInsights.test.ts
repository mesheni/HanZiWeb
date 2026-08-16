import { describe, it, expect } from 'vitest';
import {
  computeDueForecast,
  computeStabilityHistogram,
  computeDifficultyHistogram,
  computeStateDistribution,
  type FsrsInsightDoc,
} from './fsrsInsights';

function doc(overrides: Partial<FsrsInsightDoc>): FsrsInsightDoc {
  return {
    state: 'review',
    stability: 5,
    difficulty: 5,
    dueDate: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('computeDueForecast', () => {
  const now = new Date(2026, 7, 16, 15, 0); // 16.08.2026 15:00 локально

  it('считает просроченные отдельно от сегодняшних', () => {
    const res = computeDueForecast(
      [
        doc({ dueDate: '2026-08-15T10:00:00' }), // вчера → overdue
        doc({ dueDate: '2026-08-16T23:59:00' }), // сегодня
        doc({ dueDate: '2026-08-17T01:00:00' }), // завтра
      ],
      now,
    );
    expect(res.overdue).toBe(1);
    expect(res.perDay[0]).toBe(1);
    expect(res.perDay[1]).toBe(1);
  });

  it('не считает слова за пределами окна', () => {
    const res = computeDueForecast([doc({ dueDate: '2026-09-01T00:00:00' })], now);
    expect(res.perDay.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('битый dueDate игнорируется', () => {
    const res = computeDueForecast([doc({ dueDate: 'not-a-date' })], now);
    expect(res.overdue).toBe(0);
  });
});

describe('computeStabilityHistogram', () => {
  it('раскладывает по бакетам по границам <1 / 1–3 / 3–7 / 7–21 / 21+', () => {
    const res = computeStabilityHistogram([
      doc({ stability: 0.5 }),
      doc({ stability: 2 }),
      doc({ stability: 6.9 }),
      doc({ stability: 21 }),
      doc({ stability: 100 }),
    ]);
    expect(res.map((b) => b.count)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('computeDifficultyHistogram', () => {
  it('округляет до целого: 3.5 → категория 4–5', () => {
    const res = computeDifficultyHistogram([
      doc({ difficulty: 3 }),
      doc({ difficulty: 3.5 }),
      doc({ difficulty: 5 }),
      doc({ difficulty: 10 }),
    ]);
    expect(res.map((b) => b.count)).toEqual([1, 2, 0, 1]);
  });
});

describe('computeStateDistribution', () => {
  it('возвращает все 4 состояния в фиксированном порядке', () => {
    const res = computeStateDistribution([
      doc({ state: 'review' }),
      doc({ state: 'review' }),
      doc({ state: 'new' }),
    ]);
    expect(res.map((b) => b.label)).toEqual(['Новые', 'Учу', 'Повтор', 'Усвоено']);
    expect(res.map((b) => b.count)).toEqual([1, 0, 2, 0]);
  });
});
