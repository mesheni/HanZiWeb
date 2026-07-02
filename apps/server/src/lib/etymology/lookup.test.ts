import { describe, it, expect } from 'vitest';
import { lookupEtymology, lookupAllEtymologies } from './lookup.js';
import { ETYMOLOGY_DICTIONARY, hasDictionaryEntry } from './characters.js';

describe('hasDictionaryEntry', () => {
  it('returns true for known HSK 1-2 characters', () => {
    expect(hasDictionaryEntry('一')).toBe(true);
    expect(hasDictionaryEntry('中')).toBe(true);
    expect(hasDictionaryEntry('好')).toBe(true);
  });

  it('returns false for non-CJK or out-of-dictionary characters', () => {
    expect(hasDictionaryEntry('龍')).toBe(false);
    expect(hasDictionaryEntry('A')).toBe(false);
    expect(hasDictionaryEntry('1')).toBe(false);
    expect(hasDictionaryEntry('')).toBe(false);
  });
});

describe('lookupEtymology', () => {
  it('returns full etymology for a known character', () => {
    const r = lookupEtymology('明', 'míng');
    expect(r.found).toBe(true);
    expect(r.character).toBe('明');
    expect(r.pinyin).toBe('míng');
    expect(r.strokeCount).toBe(8);
    expect(r.radical?.character).toBe('日');
    expect(r.structure).toBe('left-right');
    expect(r.components.map((c) => c.character)).toEqual(['日', '月']);
    expect(r.etymology).toBeTruthy();
    expect(r.mnemonic).toBeTruthy();
  });

  it('takes the first character of a multi-character string', () => {
    const r = lookupEtymology('麤麤', 'cū cū');
    expect(r.character).toBe('麤');
    // 麤 — нет в словаре → empty, но character должен быть извлечён.
    expect(r.found).toBe(false);
    expect(r.pinyin).toBe('cū cū');
  });

  it('returns empty etymology for unknown character with found=false', () => {
    const r = lookupEtymology('龍', 'lóng');
    expect(r.found).toBe(false);
    expect(r.character).toBe('龍');
    expect(r.radical).toBeNull();
    expect(r.components).toEqual([]);
    expect(r.etymology).toBeNull();
    expect(r.strokeCount).toBeNull();
  });

  it('handles empty input without throwing', () => {
    const r = lookupEtymology('');
    expect(r.found).toBe(false);
    expect(r.character).toBe('');
  });

  it('handles whitespace input', () => {
    const r = lookupEtymology('   ');
    expect(r.found).toBe(false);
  });

  it('preserves radical fields for known character', () => {
    const r = lookupEtymology('学', 'xué');
    if (r.found) {
      expect(r.radical).not.toBeNull();
      expect(r.radical?.number).toBeGreaterThan(0);
      expect(r.radical?.number).toBeLessThanOrEqual(214);
    }
  });

  it('components include role classification', () => {
    const r = lookupEtymology('明', 'míng');
    const roles = r.components.map((c) => c.role);
    for (const role of roles) {
      expect(['semantic', 'phonetic', 'both']).toContain(role);
    }
  });

  it('dictionary stays internally consistent (no duplicate entries)', () => {
    const seen = new Set<string>();
    for (const ch of Object.keys(ETYMOLOGY_DICTIONARY)) {
      expect(seen.has(ch)).toBe(false);
      seen.add(ch);
    }
  });

  it('dictionary entries have valid structure', () => {
    for (const [ch, entry] of Object.entries(ETYMOLOGY_DICTIONARY)) {
      expect(entry.character).toBe(ch);
      expect(entry.strokeCount).toBeGreaterThan(0);
      expect(entry.radical.character).toBeTruthy();
      expect(entry.radical.number).toBeGreaterThan(0);
      expect(entry.radical.number).toBeLessThanOrEqual(214);
      expect(['simple', 'left-right', 'top-bottom', 'surrounding', 'overlap']).toContain(
        entry.structure,
      );
      for (const c of entry.components) {
        expect(c.character).toBeTruthy();
        expect(c.meaning).toBeTruthy();
        expect(['semantic', 'phonetic', 'both']).toContain(c.role);
      }
      expect(entry.etymology).toBeTruthy();
      expect(entry.mnemonic).toBeTruthy();
    }
  });
});

describe('lookupAllEtymologies', () => {
  it('returns unique entries for each character', () => {
    const results = lookupAllEtymologies('好好');
    const chars = results.map((r) => r.character);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it('handles single character', () => {
    const results = lookupAllEtymologies('中');
    expect(results).toHaveLength(1);
    expect(results[0]?.character).toBe('中');
  });

  it('handles empty string', () => {
    expect(lookupAllEtymologies('')).toEqual([]);
  });
});
