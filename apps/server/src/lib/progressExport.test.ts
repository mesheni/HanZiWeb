import { describe, it, expect } from 'vitest';
import { ProgressRecordSchema } from '@hanzi/shared';

// Внутренняя шкала difficulty — [0, 1] (PLAN_Features_v0.4 §42):
// экспорт/импорт не должен принимать значение 5.0 (FSRS [1, 10] шкала),
// иначе импорт молча испортит UserWordProgress.difficulty.

function mkRecord(overrides: Record<string, unknown> = {}) {
  return {
    wordId: '3f8f9c3e-1a2b-4c5d-9e8f-0a1b2c3d4e5f',
    state: 'learning',
    stability: 1.2,
    difficulty: 0.5,
    reps: 3,
    dueDate: '2026-07-04T12:00:00.000Z',
    lastReviewDate: null,
    ...overrides,
  };
}

describe('ProgressRecordSchema.difficulty bounds (PLAN_Features_v0.4 §42)', () => {
  it('accepts difficulty inside [0, 1]', () => {
    expect(ProgressRecordSchema.safeParse(mkRecord({ difficulty: 0 })).success).toBe(true);
    expect(ProgressRecordSchema.safeParse(mkRecord({ difficulty: 0.5 })).success).toBe(true);
    expect(ProgressRecordSchema.safeParse(mkRecord({ difficulty: 1 })).success).toBe(true);
  });

  it('rejects difficulty 5.0 (FSRS [1, 10] scale) and negative values', () => {
    expect(ProgressRecordSchema.safeParse(mkRecord({ difficulty: 5 })).success).toBe(false);
    expect(ProgressRecordSchema.safeParse(mkRecord({ difficulty: -0.1 })).success).toBe(false);
    expect(ProgressRecordSchema.safeParse(mkRecord({ difficulty: 1.01 })).success).toBe(false);
  });
});
