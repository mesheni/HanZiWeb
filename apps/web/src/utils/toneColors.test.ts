import { describe, it, expect } from 'vitest';
import { TONE_COLORS, parsePinyin } from './toneColors';

describe('TONE_COLORS', () => {
  it('покрывает тона 0..4 и ссылается на CSS-переменные', () => {
    for (let tone = 0; tone <= 4; tone++) {
      const value = TONE_COLORS[tone as 0 | 1 | 2 | 3 | 4];
      expect(value).toBe(`var(--tone-${tone})`);
    }
  });
});

describe('parsePinyin', () => {
  it('определяет тона слогов', () => {
    expect(parsePinyin('xǐ huān')).toEqual([
      { syllable: 'xǐ', tone: 3 },
      { syllable: 'huān', tone: 1 },
    ]);
  });

  it('нейтральный тон для слогов без диакритики', () => {
    expect(parsePinyin('ma')).toEqual([{ syllable: 'ma', tone: 0 }]);
  });
});
