import { describe, it, expect } from 'vitest';
import {
  SyncRequestSchema,
  SyncResponseSchema,
  SyncResultSchema,
  SyncChangeSchema,
  ServerChangeSchema,
} from './sync';
import { UserWordProgressSchema, SrsRatingSchema, WordStateSchema } from './progress';
import { RegisterDeviceSchema, UpdateNotificationSettingsSchema } from './device';
import { getDeckProgressColor, DeckProgressColorSchema } from './stats';

describe('SyncRequestSchema (F31)', () => {
  it('принимает study_answer-изменение без sinceTimestamp', () => {
    const body = {
      changes: [
        {
          id: 'local-1',
          type: 'study_answer',
          payload: { wordId: 'w1', rating: 4, timestamp: '2026-07-03T12:00:00.000Z' },
        },
      ],
    };
    expect(SyncRequestSchema.parse(body).sinceTimestamp).toBeUndefined();
  });

  it('sinceTimestamp — ISO datetime, не-ISO отклоняется', () => {
    const ok = SyncRequestSchema.safeParse({
      changes: [],
      sinceTimestamp: '2026-07-03T12:00:00.000Z',
    });
    expect(ok.success).toBe(true);
    const bad = SyncRequestSchema.safeParse({
      changes: [],
      sinceTimestamp: 'yesterday',
    });
    expect(bad.success).toBe(false);
  });

  it('неизвестный type отклоняется (discriminated union)', () => {
    const res = SyncChangeSchema.safeParse({
      id: 'x',
      type: 'delete_word',
      payload: {},
    });
    expect(res.success).toBe(false);
  });
});

describe('SyncResponseSchema (F31)', () => {
  const result = {
    changeId: 'local-1',
    outcome: 'applied',
    wordId: 'w1',
    newStability: 2.5,
    newDifficulty: 4.2,
    newState: 'learning',
    newDueDate: '2026-07-04T12:00:00.000Z',
    intervalDays: 1,
    xpGain: 3,
  };

  it('принимает валидный результат и serverChanges', () => {
    const res = SyncResponseSchema.parse({
      results: [result],
      nextCursor: 5,
      serverChanges: [
        {
          wordId: 'w1',
          state: 'learning',
          stability: 2.5,
          difficulty: 4.2,
          reps: 1,
          dueDate: '2026-07-04T12:00:00.000Z',
          lastReviewDate: '2026-07-03T12:00:00.000Z',
          timestamp: '2026-07-03T12:00:01.000Z',
        },
      ],
    });
    expect(res.results[0]!.outcome).toBe('applied');
    expect(res.serverChanges).toHaveLength(1);
    expect(res.nextCursor).toBe(5);
  });

  it('отклоняет ответ без nextCursor (F32)', () => {
    const bad = SyncResponseSchema.safeParse({
      results: [result],
      serverChanges: [],
    });
    expect(bad.success).toBe(false);
  });

  it('outcome — только терминальные исходы (F05)', () => {
    const bad = SyncResponseSchema.safeParse({
      results: [{ ...result, outcome: 'pending' }],
      serverChanges: [],
      nextCursor: 0,
    });
    expect(bad.success).toBe(false);
    for (const outcome of ['applied', 'duplicate', 'stale', 'rejected'] as const) {
      expect(SyncResultSchema.parse({ ...result, outcome }).outcome).toBe(outcome);
    }
  });

  it('newState — только FSRS-состояния', () => {
    const bad = SyncResponseSchema.safeParse({
      results: [{ ...result, newState: 'mastered' }],
      serverChanges: [],
      nextCursor: 0,
    });
    expect(bad.success).toBe(false);
  });
});

describe('UserWordProgressSchema (F31)', () => {
  const base = {
    id: '5f8d5b1e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
    userId: '5f8d5b1e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
    wordId: '5f8d5b1e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
    state: 'review',
    dueDate: '2026-06-30T18:00:00.000Z',
  };

  it('дефолты stability/difficulty/reps', () => {
    const parsed = UserWordProgressSchema.parse(base);
    expect(parsed.stability).toBe(0);
    expect(parsed.difficulty).toBe(5);
    expect(parsed.reps).toBe(0);
    expect(parsed.lastReviewDate).toBeNull();
  });

  it('difficulty вне FSRS-5 шкалы [1,10] отклоняется (§46)', () => {
    const bad = UserWordProgressSchema.safeParse({ ...base, difficulty: 0.5 });
    expect(bad.success).toBe(false);
  });

  it('SrsRating — только 1..4', () => {
    expect(SrsRatingSchema.parse(3)).toBe(3);
    expect(SrsRatingSchema.safeParse(5).success).toBe(false);
    expect(WordStateSchema.safeParse('graduated').success).toBe(true);
    expect(WordStateSchema.safeParse('mastered').success).toBe(false);
  });
});

describe('Device schemas (F31)', () => {
  it('RegisterDeviceSchema — дефолты для p256dh/auth/platform', () => {
    const parsed = RegisterDeviceSchema.parse({ fcmToken: 'tok' });
    expect(parsed.p256dh).toBe('');
    expect(parsed.auth).toBe('');
    expect(parsed.platform).toBe('web');
    expect(RegisterDeviceSchema.safeParse({}).success).toBe(false);
  });

  it('UpdateNotificationSettingsSchema — enum времени и частота 1..24', () => {
    const ok = UpdateNotificationSettingsSchema.parse({
      notificationEnabled: true,
      notificationTime: 'evening',
      notificationFrequency: 3,
    });
    expect(ok.notificationTime).toBe('evening');
    const bad = UpdateNotificationSettingsSchema.safeParse({
      notificationEnabled: true,
      notificationTime: 'midnight',
      notificationFrequency: 25,
    });
    expect(bad.success).toBe(false);
  });
});

describe('DeckProgressColor (F31)', () => {
  it('enum — 4 уровня', () => {
    expect(DeckProgressColorSchema.safeParse('low').success).toBe(true);
    expect(DeckProgressColorSchema.safeParse('epic').success).toBe(false);
  });

  it('getDeckProgressColor — границы из global.css шкалы', () => {
    expect(getDeckProgressColor(0)).toBe('low');
    expect(getDeckProgressColor(24)).toBe('low');
    expect(getDeckProgressColor(25)).toBe('medium');
    expect(getDeckProgressColor(49)).toBe('medium');
    expect(getDeckProgressColor(50)).toBe('high');
    expect(getDeckProgressColor(74)).toBe('high');
    expect(getDeckProgressColor(75)).toBe('complete');
    expect(getDeckProgressColor(100)).toBe('complete');
  });
});

describe('ServerChangeSchema (F31)', () => {
  it('lastReviewDate nullable, timestamp обязателен', () => {
    const base = {
      wordId: 'w1',
      state: 'learning',
      stability: 1,
      difficulty: 5,
      reps: 1,
      dueDate: '2026-07-04T12:00:00.000Z',
      timestamp: '2026-07-03T12:00:01.000Z',
    };
    expect(ServerChangeSchema.parse({ ...base, lastReviewDate: null }).lastReviewDate).toBeNull();
    expect(
      ServerChangeSchema.safeParse({ ...base, lastReviewDate: null, timestamp: undefined }).success,
    ).toBe(false);
  });
});
