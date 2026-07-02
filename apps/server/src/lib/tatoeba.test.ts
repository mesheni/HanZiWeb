import { describe, it, expect } from 'vitest';
import { pickRussianTranslation } from './tatoeba.js';
import type { TatoebaSentence } from './tatoeba.js';

describe('pickRussianTranslation', () => {
  it('returns the first Russian translation', () => {
    const s: TatoebaSentence = {
      id: 1,
      text: '你好',
      lang: 'cmn',
      translations: [
        { id: 2, text: 'Привет', lang: 'rus' },
        { id: 3, text: 'Hello', lang: 'eng' },
      ],
    };
    expect(pickRussianTranslation(s)).toEqual({ id: 2, text: 'Привет', lang: 'rus' });
  });

  it('returns null when no Russian translation present', () => {
    const s: TatoebaSentence = {
      id: 1,
      text: '你好',
      lang: 'cmn',
      translations: [{ id: 3, text: 'Hello', lang: 'eng' }],
    };
    expect(pickRussianTranslation(s)).toBeNull();
  });

  it('returns null when translations missing entirely', () => {
    const s: TatoebaSentence = { id: 1, text: '你好', lang: 'cmn' };
    expect(pickRussianTranslation(s)).toBeNull();
  });

  it('respects custom Russian lang code', () => {
    const s: TatoebaSentence = {
      id: 1,
      text: '你好',
      lang: 'cmn',
      translations: [{ id: 2, text: 'ru', lang: 'rus' }],
    };
    expect(pickRussianTranslation(s, 'rus')?.text).toBe('ru');
    expect(pickRussianTranslation(s, 'eng')).toBeNull();
  });
});
