import { describe, expect, it } from 'vitest';
import { selectLocalCards, shuffle, type LocalWord, type LocalProgress } from './sessionSelection';

const WORD = (id: string): LocalWord => ({
  id,
  character: `字${id}`,
  pinyin: 'p',
  translation: 't',
});

const PROGRESS = (
  wordId: string,
  dueDate: string,
  overrides: Partial<LocalProgress> = {},
): LocalProgress => ({
  wordId,
  state: 'review',
  stability: 3.5,
  difficulty: 5,
  dueDate,
  ...overrides,
});

const NOW = Date.parse('2026-08-08T12:00:00.000Z');

describe('selectLocalCards (F21: офлайн-сессия из локальных данных)', () => {
  it('отбирает due-слова (dueDate <= now) и новые слова без прогресса', () => {
    const words = [WORD('w1'), WORD('w2'), WORD('w3')];
    const progress = [
      PROGRESS('w1', '2026-08-08T10:00:00.000Z'), // due
      PROGRESS('w2', '2026-08-09T10:00:00.000Z'), // не due
    ];
    const cards = selectLocalCards(words, progress, { cardLimit: 10, includeNew: true, now: NOW });
    const ids = cards.map((c) => c.word.id).sort();
    expect(ids).toEqual(['w1', 'w3']);
  });

  it('due-слова идут перед новыми, независимо от порядка во входе', () => {
    const words = [WORD('fresh1'), WORD('due2'), WORD('due1'), WORD('fresh2')];
    const progress = [
      PROGRESS('due1', '2026-08-08T00:00:00.000Z'),
      PROGRESS('due2', '2026-08-08T00:00:00.000Z'),
    ];
    const cards = selectLocalCards(words, progress, { cardLimit: 10, includeNew: true, now: NOW });
    // Пулы перемешиваются — внутри due порядок случайный, но все due
    // обязаны идти раньше всех fresh.
    expect(
      cards
        .slice(0, 2)
        .map((c) => c.word.id)
        .sort(),
    ).toEqual(['due1', 'due2']);
    expect(cards[2]?.word.id.startsWith('fresh')).toBe(true);
    expect(cards[3]?.word.id.startsWith('fresh')).toBe(true);
  });

  it('соблюдает cardLimit', () => {
    const words = Array.from({ length: 10 }, (_, i) => WORD(`w${i}`));
    const cards = selectLocalCards(words, [], { cardLimit: 3, includeNew: true, now: NOW });
    expect(cards).toHaveLength(3);
  });

  it('includeNew=false оставляет только due-слова', () => {
    const words = [WORD('w1'), WORD('w2')];
    const progress = [PROGRESS('w1', '2026-08-08T00:00:00.000Z')];
    const cards = selectLocalCards(words, progress, { cardLimit: 10, includeNew: false, now: NOW });
    const ids = cards.map((c) => c.word.id);
    expect(ids).toEqual(['w1']);
  });

  it('для новых слов отдаёт дефолтные FSRS-параметры (new/0/5)', () => {
    const cards = selectLocalCards([WORD('w1')], [], { cardLimit: 10, includeNew: true, now: NOW });
    expect(cards[0]).toMatchObject({ state: 'new', stability: 0, difficulty: 5 });
  });

  it('для due-слов отдаёт FSRS-параметры из прогресса', () => {
    const cards = selectLocalCards(
      [WORD('w1')],
      [PROGRESS('w1', '2026-08-08T00:00:00.000Z', { stability: 12.5, difficulty: 6.2 })],
      {
        cardLimit: 10,
        includeNew: true,
        now: NOW,
      },
    );
    expect(cards[0]).toMatchObject({ state: 'review', stability: 12.5, difficulty: 6.2 });
  });

  it('пустые данные → пустая сессия', () => {
    expect(selectLocalCards([], [], { cardLimit: 10, includeNew: true, now: NOW })).toEqual([]);
  });

  it('shuffle не теряет элементы', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = shuffle(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });
});
