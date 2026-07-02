import { describe, it, expect } from 'vitest';
import { normalizePinyin, pinyinEquals, pinyinSyllableMatches } from './pinyinNormalize';

describe('normalizePinyin', () => {
  it('strips tone marks (NFD + combining marks)', () => {
    expect(normalizePinyin('xǐ huān')).toBe('xi huan');
    expect(normalizePinyin('nǐ hǎo')).toBe('ni hao');
  });

  it('strips numeric tone markers', () => {
    expect(normalizePinyin('xi3 huan1')).toBe('xi huan');
    expect(normalizePinyin('ni3hao3')).toBe('nihao');
  });

  it('lowercases', () => {
    expect(normalizePinyin('NI HAO')).toBe('ni hao');
  });

  it('collapses whitespace', () => {
    expect(normalizePinyin('ni   hao')).toBe('ni hao');
    expect(normalizePinyin('  ni  hao  ')).toBe('ni hao');
  });

  it('handles ü / v alternation', () => {
    expect(normalizePinyin('lǚ')).toBe('lu');
  });
});

describe('pinyinEquals', () => {
  it('matches with different tone markers', () => {
    expect(pinyinEquals('xǐ huān', 'xi3 huan1')).toBe(true);
    expect(pinyinEquals('xǐ huān', 'xi huan')).toBe(true);
  });

  it('matches ignoring spaces', () => {
    expect(pinyinEquals('xǐ huān', 'xǐhuān')).toBe(true);
  });

  it('does not match different words', () => {
    expect(pinyinEquals('xǐ huān', 'xǐ hǎo')).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(pinyinEquals('', 'ni hao')).toBe(false);
    expect(pinyinEquals('ni hao', '')).toBe(false);
  });
});

describe('pinyinSyllableMatches', () => {
  it('returns per-syllable boolean array', () => {
    const result = pinyinSyllableMatches('xi3 huan1', 'xǐ huān');
    expect(result).toEqual([true, true]);
  });

  it('marks wrong syllables as false', () => {
    const result = pinyinSyllableMatches('xi3 hao3', 'xǐ huān');
    expect(result).toEqual([true, false]);
  });

  it('pads with false when input is shorter', () => {
    const result = pinyinSyllableMatches('xi3', 'xǐ huān');
    expect(result).toEqual([true, false]);
  });

  it('pads with false when input is longer', () => {
    const result = pinyinSyllableMatches('xi3 huan1 ma', 'xǐ huān');
    expect(result).toEqual([true, true, false]);
  });
});
