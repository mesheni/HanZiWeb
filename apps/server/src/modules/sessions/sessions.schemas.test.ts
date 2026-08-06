import { describe, it, expect } from 'vitest';
import { SessionCardSchema } from '@hanzi/shared';

// Контракт карточки сессии (PLAN_Features_v0.5 #23): stability/difficulty/
// state/distractors сервер отдаёт всегда — схема обязана падать при их
// пропуске, а не подставлять дефолты (иначе мобильный оптимистичный FSRS
// посчитал бы от (0, 5) и дрифт выглядел бы «почти нормально»). Дефолт
// остаётся только у чисто клиентского `answered`.

const UUID = '11111111-1111-4111-8111-111111111111';

function mkCard(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    index: 0,
    word: {
      id: UUID,
      character: '喜欢',
      pinyin: 'xǐ huān',
      translation: 'нравиться',
      createdAt: new Date().toISOString(),
    },
    state: 'review',
    stability: 12.5,
    difficulty: 5.5,
    distractors: ['爱', '高兴'],
    ...overrides,
  };
}

describe('SessionCardSchema (PLAN_Features_v0.5 #23)', () => {
  it('accepts the server card shape', () => {
    expect(SessionCardSchema.safeParse(mkCard()).success).toBe(true);
  });

  it('rejects a card without stability (server drift must not be masked)', () => {
    const { stability: _stability, ...rest } = mkCard();
    expect(SessionCardSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a card without difficulty', () => {
    const { difficulty: _difficulty, ...rest } = mkCard();
    expect(SessionCardSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a card without state', () => {
    const { state: _state, ...rest } = mkCard();
    expect(SessionCardSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a card without distractors', () => {
    const { distractors: _distractors, ...rest } = mkCard();
    expect(SessionCardSchema.safeParse(rest).success).toBe(false);
  });

  it('defaults answered to false (pure client field)', () => {
    const parsed = SessionCardSchema.safeParse(mkCard());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.answered).toBe(false);
  });

  it('accepts answered: true', () => {
    expect(SessionCardSchema.safeParse(mkCard({ answered: true })).success).toBe(true);
  });
});
