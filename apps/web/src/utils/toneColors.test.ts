import { describe, it, expect } from 'vitest';
import { TONE_COLORS } from './toneColors';
import { parsePinyin } from '@hanzi/shared';

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

  it('разделяет склеенный пиньинь по позициям тон-маркеров', () => {
    expect(parsePinyin('báitiān')).toEqual([
      { syllable: 'bái', tone: 2 },
      { syllable: 'tiān', tone: 1 },
    ]);
  });

  it('разделяет трёхсложный склеенный пиньинь', () => {
    expect(parsePinyin('bìyèshēng')).toEqual([
      { syllable: 'bì', tone: 4 },
      { syllable: 'yè', tone: 4 },
      { syllable: 'shēng', tone: 1 },
    ]);
  });

  it('трактует // как явный слоговый разделитель', () => {
    expect(parsePinyin('ài//guó')).toEqual([
      { syllable: 'ài', tone: 4 },
      { syllable: 'guó', tone: 2 },
    ]);
  });

  it('трактует одиночный / как явный слоговый разделитель', () => {
    expect(parsePinyin('ài/guó')).toEqual([
      { syllable: 'ài', tone: 4 },
      { syllable: 'guó', tone: 2 },
    ]);
  });
});
