import { describe, it, expect } from 'vitest';
import {
  ServerChangeSchema,
  SyncRequestSchema,
  SyncResultSchema,
  SyncResponseSchema,
  type ServerChange,
} from '@hanzi/shared';

// Контракт sync-ответа (PLAN_Features_v0.4 §40, §41, §46):
// serverChanges валидируется схемой, difficulty — каноническая
// FSRS-5 шкала [1, 10].

// `state?: string` намеренно шире типа — тест проверяет инвалидные
// значения, которые схема должна отклонить.
function mkServerChange(
  overrides: Omit<Partial<ServerChange>, 'state'> & { state?: string } = {},
): ServerChange {
  return {
    wordId: 'w1',
    state: 'review',
    stability: 5,
    difficulty: 3,
    reps: 2,
    dueDate: new Date().toISOString(),
    lastReviewDate: null,
    timestamp: new Date().toISOString(),
    ...(overrides as Record<string, unknown>),
  } as ServerChange;
}

describe('ServerChangeSchema (PLAN_Features_v0.4 §40)', () => {
  it('accepts the server payload shape', () => {
    expect(ServerChangeSchema.safeParse(mkServerChange()).success).toBe(true);
  });

  it('rejects unknown word state (server drift)', () => {
    expect(ServerChangeSchema.safeParse(mkServerChange({ state: 'bogus' })).success).toBe(false);
  });

  it('rejects difficulty outside the canonical FSRS-5 scale [1, 10]', () => {
    expect(ServerChangeSchema.safeParse(mkServerChange({ difficulty: 0.5 })).success).toBe(false);
    expect(ServerChangeSchema.safeParse(mkServerChange({ difficulty: -0.1 })).success).toBe(false);
    expect(ServerChangeSchema.safeParse(mkServerChange({ difficulty: 11 })).success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const { wordId: _wordId, ...rest } = mkServerChange();
    expect(ServerChangeSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects non-integer reps', () => {
    expect(ServerChangeSchema.safeParse(mkServerChange({ reps: 2.5 })).success).toBe(false);
  });
});

describe('SyncRequestSchema sinceTimestamp (incremental sync cursor, PLAN_Features_v0.4 §48)', () => {
  it('accepts a request without a cursor (first sync = full snapshot)', () => {
    expect(SyncRequestSchema.safeParse({ changes: [] }).success).toBe(true);
  });

  it('accepts a valid ISO sinceTimestamp', () => {
    expect(
      SyncRequestSchema.safeParse({ changes: [], sinceTimestamp: new Date().toISOString() })
        .success,
    ).toBe(true);
  });

  it('rejects a malformed sinceTimestamp', () => {
    expect(SyncRequestSchema.safeParse({ changes: [], sinceTimestamp: 'not-a-date' }).success).toBe(
      false,
    );
  });
});

describe('SyncResultSchema difficulty bounds (PLAN_Features_v0.4 §41)', () => {
  const base = {
    changeId: 'c1',
    wordId: 'w1',
    newStability: 1,
    newState: 'learning',
    newDueDate: new Date().toISOString(),
    intervalDays: 0,
    xpGain: 0,
  };

  it('accepts difficulty inside the canonical FSRS-5 scale [1, 10]', () => {
    expect(SyncResultSchema.safeParse({ ...base, newDifficulty: 1 }).success).toBe(true);
    expect(SyncResultSchema.safeParse({ ...base, newDifficulty: 5.5 }).success).toBe(true);
    expect(SyncResultSchema.safeParse({ ...base, newDifficulty: 10 }).success).toBe(true);
  });

  it('rejects difficulty outside [1, 10] (incl. old [0, 1] scale)', () => {
    expect(SyncResultSchema.safeParse({ ...base, newDifficulty: 0.5 }).success).toBe(false);
    expect(SyncResultSchema.safeParse({ ...base, newDifficulty: 0 }).success).toBe(false);
    expect(SyncResultSchema.safeParse({ ...base, newDifficulty: 11 }).success).toBe(false);
  });
});

describe('SyncResponseSchema (PLAN_Features_v0.4 §40)', () => {
  it('accepts a well-formed response', () => {
    const response = {
      results: [
        {
          changeId: 'c1',
          wordId: 'w1',
          newStability: 1,
          newDifficulty: 5,
          newState: 'learning',
          newDueDate: new Date().toISOString(),
          intervalDays: 0,
          xpGain: 0,
        },
      ],
      serverChanges: [mkServerChange()],
    };
    expect(SyncResponseSchema.safeParse(response).success).toBe(true);
  });

  it('rejects a malformed serverChanges entry', () => {
    const response = {
      results: [],
      serverChanges: [{ wordId: 'w1', state: 'bogus' }],
    };
    expect(SyncResponseSchema.safeParse(response).success).toBe(false);
  });
});
