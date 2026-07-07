import { describe, it, expect } from 'vitest';
import type { Word } from '@hanzi/shared';
import { getCharacterDistractors } from './useDistractorPool';

const makeWord = (id: string, character: string): Word => ({
  id,
  character,
  pinyin: '',
  translation: '',
  hskLevel: 1,
  audioUrl: null,
  mnemonic: null,
  createdAt: new Date().toISOString(),
  examples: [],
  tags: [],
});

describe('getCharacterDistractors', () => {
  it('returns characters from other words, excluding target word characters', () => {
    const target = makeWord('1', '喜欢');
    const pool = [target, makeWord('2', '水'), makeWord('3', '火'), makeWord('4', '山')];
    const result = getCharacterDistractors(target, pool, 3);
    for (const ch of result) {
      expect(target.character.includes(ch)).toBe(false);
      expect(['水', '火', '山'].includes(ch)).toBe(true);
    }
    expect(new Set(result).size).toBe(result.length);
  });

  it('does not include the target word itself', () => {
    const target = makeWord('1', '爱');
    const result = getCharacterDistractors(target, [target], 3);
    expect(result).toHaveLength(0);
  });

  it('deduplicates characters across pool words', () => {
    const target = makeWord('1', '爱');
    const pool = [makeWord('2', '水水'), makeWord('3', '水')];
    const result = getCharacterDistractors(target, pool, 5);
    expect(result).toEqual(['水']);
  });

  it('respects the count limit', () => {
    const target = makeWord('1', '爱');
    const pool = [makeWord('2', '水火山月日')];
    const result = getCharacterDistractors(target, pool, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
