import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lookupEtymology, lookupAllEtymologies } from './lookup.js';
import { getEtymologyDataset, hasEtymologyEntry } from './dataset.js';

describe('dataset', () => {
  it('covers every unique character of the HSK seed files', () => {
    const seedsDir = resolve(process.cwd(), 'prisma/seeds');
    const chars = new Set<string>();
    for (const file of readdirSync(seedsDir)) {
      if (!/^hsk\d+\.json$/.test(file)) continue;
      const text = readFileSync(resolve(seedsDir, file), 'utf8');
      for (const ch of Array.from(text)) {
        if (/[\u3400-\u9FFF\uF900-\uFAFF]/.test(ch)) chars.add(ch);
      }
    }
    expect(chars.size).toBeGreaterThan(1500);
    const dataset = getEtymologyDataset();
    const missing = [...chars].filter((ch) => !dataset.has(ch));
    expect(missing).toEqual([]);
  });

  it('has no duplicate characters', () => {
    const dataset = getEtymologyDataset();
    expect(dataset.size).toBeGreaterThan(9000);
  });
});

describe('hasEtymologyEntry', () => {
  it('returns true for known characters', () => {
    expect(hasEtymologyEntry('一')).toBe(true);
    expect(hasEtymologyEntry('中')).toBe(true);
    expect(hasEtymologyEntry('好')).toBe(true);
  });

  it('returns false for non-CJK characters', () => {
    expect(hasEtymologyEntry('Ж')).toBe(false);
    expect(hasEtymologyEntry('A')).toBe(false);
    expect(hasEtymologyEntry('')).toBe(false);
  });
});

describe('lookupEtymology', () => {
  it('returns full etymology for a known character (明)', () => {
    const r = lookupEtymology('明', 'míng');
    expect(r.found).toBe(true);
    expect(r.character).toBe('明');
    expect(r.pinyin).toBe('míng');
    expect(r.definitionRu).toBeTruthy();
    expect(r.definitionEn).toBeTruthy();
    expect(r.decomposition).toBe('⿰日月');
    expect(r.structure).toBe('left-right');
    expect(r.strokeCount).toBe(8);
    expect(r.radicalChar).toBeTruthy();
    expect(r.etymologyType).toBe('ideographic');
    expect(r.etymologyTypeRu).toBeTruthy();
    expect(r.hintRu).toBeTruthy();
    expect(r.matches).toHaveLength(8);
  });

  it('splits components with their strokes (明 = 日 + 月)', () => {
    const r = lookupEtymology('明');
    expect(r.components.map((c) => c.character)).toEqual(['日', '月']);
    expect(r.components[0]).toMatchObject({ character: '日', strokes: [0, 1, 2, 3] });
    expect(r.components[1]).toMatchObject({ character: '月', strokes: [4, 5, 6, 7] });
    expect(r.components.map((c) => c.role)).toEqual([null, null]);
  });

  it('assigns phonetic/semantic roles (吗 = semantic 口 + phonetic 马)', () => {
    const r = lookupEtymology('吗');
    expect(r.etymologyType).toBe('pictophonetic');
    expect(r.semantic).toBe('口');
    expect(r.phonetic).toBe('马');
    const kou = r.components.find((c) => c.character === '口');
    const ma = r.components.find((c) => c.character === '马');
    expect(kou?.role).toBe('semantic');
    expect(ma?.role).toBe('phonetic');
  });

  it('resolves component meanings and pinyin from the same dataset', () => {
    const r = lookupEtymology('好');
    const dataset = getEtymologyDataset();
    const nv = r.components.find((c) => c.character === '女');
    expect(nv?.meaningRu).toBe(dataset.get('女')?.definition_ru);
    expect(nv?.pinyin).toBe(dataset.get('女')?.pinyin?.[0]);
  });

  it('handles nested decomposition (学)', () => {
    const r = lookupEtymology('学');
    expect(r.structure).toBe('top-bottom');
    expect(r.strokeCount).toBe(r.matches?.length);
    expect(r.components.map((c) => c.character)).toEqual(['⺍', '冖', '子']);
    const total = r.components.reduce((sum, c) => sum + c.strokes.length, 0);
    expect(total).toBeLessThanOrEqual(r.strokeCount!);
    for (const c of r.components) {
      expect(c.strokes.length).toBeGreaterThan(0);
    }
  });

  it('maps overlap structure (中 = ⿻口丨)', () => {
    const r = lookupEtymology('中');
    expect(r.structure).toBe('overlap');
    expect(r.components.map((c) => c.character)).toEqual(['口', '丨']);
    expect(r.components[0]).toMatchObject({ character: '口', strokes: [0, 1, 2] });
    expect(r.components[1]).toMatchObject({ character: '丨', strokes: [3] });
  });

  it('skips unknown leaves and keeps unattributed strokes (龍)', () => {
    const r = lookupEtymology('龍');
    expect(r.components.map((c) => c.character)).toEqual(['立', '月']);
    expect(r.matches?.filter((m) => m === null)).toHaveLength(7);
  });

  it('returns no components for unknown decomposition (？)', () => {
    const r = lookupEtymology('⺀');
    expect(r.found).toBe(true);
    expect(r.decomposition).toBe('？');
    expect(r.structure).toBe('simple');
    expect(r.components).toEqual([]);
  });

  it('takes the first character of a multi-character word', () => {
    const r = lookupEtymology('学生', 'xuésheng');
    expect(r.character).toBe('学');
    expect(r.pinyin).toBe('xuésheng');
  });

  it('returns found=false for non-CJK or absent characters', () => {
    for (const ch of ['Ж', 'A', '1']) {
      const r = lookupEtymology(ch);
      expect(r.found).toBe(false);
      expect(r.character).toBe(ch);
      expect(r.components).toEqual([]);
      expect(r.matches).toBeNull();
    }
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
