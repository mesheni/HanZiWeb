import { describe, expect, it } from 'vitest';
import { buildYearGrid } from './yearGrid';

describe('buildYearGrid (F22b: heatmap года)', () => {
  it('возвращает 52+ недели по 7 дней', () => {
    const weeks = buildYearGrid(2026);
    expect(weeks.length).toBeGreaterThanOrEqual(52);
    for (const week of weeks) {
      expect(week).toHaveLength(7);
    }
  });

  it('1 января попадает в первый столбец на позиции четверга (индекс 3)', () => {
    // 2026-01-01 — четверг; первая колонка начинается с понедельника
    // недели, содержащей 1 января.
    const weeks = buildYearGrid(2026);
    expect(weeks[0]?.[3]).toBe('2026-01-01');
    // Дни до 1 января (29-31 декабря 2025) — вне года.
    expect(weeks[0]?.[0]).toBeNull();
    expect(weeks[0]?.[2]).toBeNull();
  });

  it('31 декабря присутствует в сетке', () => {
    const weeks = buildYearGrid(2026);
    const dates = weeks.flat().filter(Boolean) as string[];
    expect(dates).toContain('2026-12-31');
  });

  it('все ячейки — только даты указанного года или null', () => {
    const weeks = buildYearGrid(2025);
    for (const date of weeks.flat()) {
      if (date !== null) {
        expect(date.startsWith('2025-')).toBe(true);
      }
    }
  });
});
