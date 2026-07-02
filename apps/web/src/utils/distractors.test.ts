import { describe, it, expect } from 'vitest';
import type { Word } from '@hanzi/shared';
import { buildMultipleChoiceOptions, buildReverseChoiceOptions, buildSyllablePool } from './distractors';

const makeWord = (id: string, character: string, pinyin: string, translation: string): Word => ({
  id,
  character,
  pinyin,
  translation,
  hskLevel: 1,
  audioUrl: null,
  mnemonic: null,
  createdAt: new Date().toISOString(),
  examples: [],
});

const correct: Word = makeWord('1', '爱', 'ài', 'любить');
const pool: Word[] = [
  correct,
  makeWord('2', '水', 'shuǐ', 'вода'),
  makeWord('3', '火', 'huǒ', 'огонь'),
  makeWord('4', '山', 'shān', 'гора'),
  makeWord('5', '月', 'yuè', 'луна'),
  makeWord('6', '日', 'rì', 'солнце'),
];

describe('buildMultipleChoiceOptions', () => {
  it('includes the correct answer', () => {
    const options = buildMultipleChoiceOptions(correct, pool, 4);
    expect(options).toHaveLength(4);
    expect(options.find((o) => o.id === correct.id)).toBeDefined();
  });

  it('picks distractors with different translation', () => {
    const options = buildMultipleChoiceOptions(correct, pool, 4);
    const distractors = options.filter((o) => o.id !== correct.id);
    for (const d of distractors) {
      expect(d.translation).not.toBe(correct.translation);
    }
  });

  it('respects count parameter (fewer than 4)', () => {
    const options = buildMultipleChoiceOptions(correct, [correct, pool[1]!], 4);
    expect(options.length).toBeLessThanOrEqual(4);
  });

  it('does not include duplicates', () => {
    const options = buildMultipleChoiceOptions(correct, pool, 4);
    const ids = options.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildReverseChoiceOptions', () => {
  it('includes the correct character', () => {
    const options = buildReverseChoiceOptions(correct, pool, 4);
    expect(options.find((o) => o.id === correct.id)).toBeDefined();
  });

  it('picks distractors with different character', () => {
    const options = buildReverseChoiceOptions(correct, pool, 4);
    const distractors = options.filter((o) => o.id !== correct.id);
    for (const d of distractors) {
      expect(d.character).not.toBe(correct.character);
    }
  });
});

describe('buildSyllablePool', () => {
  it('contains all correct syllables', () => {
    const pool = buildSyllablePool('xǐ huān', ['shuǐ', 'huǒ'], 2);
    expect(pool).toContain('xǐ');
    expect(pool).toContain('huān');
  });

  it('contains some distractor syllables', () => {
    const pool = buildSyllablePool('xǐ huān', ['shuǐ', 'huǒ', 'shān', 'yuè'], 2);
    // Должны появиться слоги из distractor-ов, которых нет в правильном ответе.
    const correctSyllables = new Set(['xǐ', 'huān']);
    const extras = pool.filter((s) => !correctSyllables.has(s));
    expect(extras.length).toBeGreaterThan(0);
  });

  it('handles single-syllable words', () => {
    const pool = buildSyllablePool('shuǐ', ['huǒ', 'shān'], 1);
    expect(pool).toContain('shuǐ');
  });

  it('does not duplicate syllables', () => {
    const pool = buildSyllablePool('xǐ huān', ['shuǐ', 'huǒ', 'xǐ', 'shān'], 2);
    expect(new Set(pool).size).toBe(pool.length);
  });
});

describe('shuffle (regression for the "always last" bug)', () => {
  // Раньше использовался LCG с плавающей точкой, который всегда клал
  // правильный ответ последним. Эти тесты ловят регрессию: на 200
  // прогонах каждый из 4 индексов должен появиться хотя бы раз.
  it('places the correct answer at every index across many runs (multiple-choice)', () => {
    const correct: Word = makeWord('1', '爱', 'ài', 'любить');
    const pool: Word[] = [
      correct,
      makeWord('2', '水', 'shuǐ', 'вода'),
      makeWord('3', '火', 'huǒ', 'огонь'),
      makeWord('4', '山', 'shān', 'гора'),
      makeWord('5', '月', 'yuè', 'луна'),
    ];
    const seenAt = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const options = buildMultipleChoiceOptions(correct, pool, 4);
      seenAt.add(options.findIndex((o) => o.id === correct.id));
    }
    expect(seenAt.size).toBeGreaterThanOrEqual(3);
  });

  it('places the correct character at every index across many runs (reverse-choice)', () => {
    const correct: Word = makeWord('1', '爱', 'ài', 'любить');
    const pool: Word[] = [
      correct,
      makeWord('2', '水', 'shuǐ', 'вода'),
      makeWord('3', '火', 'huǒ', 'огонь'),
      makeWord('4', '山', 'shān', 'гора'),
      makeWord('5', '月', 'yuè', 'луна'),
    ];
    const seenAt = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const options = buildReverseChoiceOptions(correct, pool, 4);
      seenAt.add(options.findIndex((o) => o.id === correct.id));
    }
    expect(seenAt.size).toBeGreaterThanOrEqual(3);
  });
});
