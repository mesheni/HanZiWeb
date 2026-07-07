import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { TestQuestion } from '@hanzi/shared';
import {
  computeBreakdown,
  detectTone,
  gradeAnswer,
  isAnswerCorrect,
  normalizePinyinAnswer,
} from './tests.grading.js';

function mkQuestion(overrides: Partial<TestQuestion> = {}): TestQuestion {
  return {
    id: randomUUID(),
    type: 'multiple-choice-translation',
    wordId: randomUUID(),
    wordCharacter: '喜欢',
    wordPinyin: 'xǐ huān',
    wordTranslation: 'нравиться',
    wordHskLevel: 1,
    wordAudioUrl: null,
    options: ['нравиться', 'работать', 'жить', 'учиться'],
    correctAnswer: 'нравиться',
    audioUrl: null,
    clozeSentence: null,
    characterPool: [],
    ...overrides,
  };
}

describe('detectTone', () => {
  it('detects tone 1 (ā/ē/ī/ō/ū/ǖ)', () => {
    expect(detectTone('mā')).toBe(1);
    expect(detectTone('fēi')).toBe(1);
    expect(detectTone('lǖ')).toBe(1);
  });

  it('detects tone 2 (á/é/í/ó/ú/ǘ)', () => {
    expect(detectTone('má')).toBe(2);
    expect(detectTone('hú')).toBe(2);
  });

  it('detects tone 3 (ǎ/ě/ǐ/ǒ/ǔ/ǚ)', () => {
    expect(detectTone('mǎ')).toBe(3);
    expect(detectTone('nǚ')).toBe(3);
  });

  it('detects tone 4 (à/è/ì/ò/ù/ǜ)', () => {
    expect(detectTone('mà')).toBe(4);
  });

  it('uses the first non-zero tone in a multi-syllable string', () => {
    expect(detectTone('xǐ huān')).toBe(3);
    expect(detectTone('nǐ hǎo')).toBe(3);
  });

  it('falls back to tone 1 for pinyin without diacritics', () => {
    expect(detectTone('ma')).toBe(1);
    expect(detectTone('')).toBe(1);
  });
});

describe('normalizePinyinAnswer', () => {
  it('lowercases input', () => {
    expect(normalizePinyinAnswer('XI HUAN')).toBe('xi huan');
  });

  it('strips diacritic tone marks', () => {
    expect(normalizePinyinAnswer('xǐ huān')).toBe('xi huan');
  });

  it('strips numeric tone markers (1-4)', () => {
    expect(normalizePinyinAnswer('xi3 huan1')).toBe('xi huan');
  });

  it('collapses multiple spaces', () => {
    expect(normalizePinyinAnswer('xi    huan')).toBe('xi huan');
  });
});

describe('isAnswerCorrect', () => {
  it('returns false for empty input', () => {
    const q = mkQuestion({ type: 'multiple-choice-translation', correctAnswer: 'нравиться' });
    expect(isAnswerCorrect(q, '')).toBe(false);
    expect(isAnswerCorrect(q, '   ')).toBe(false);
  });

  it('exact string match for multiple-choice', () => {
    const q = mkQuestion({ type: 'multiple-choice-translation', correctAnswer: 'нравиться' });
    expect(isAnswerCorrect(q, 'нравиться')).toBe(true);
    expect(isAnswerCorrect(q, 'работать')).toBe(false);
  });

  it('exact string match for reverse-choice', () => {
    const q = mkQuestion({ type: 'reverse-choice-character', correctAnswer: '喜欢' });
    expect(isAnswerCorrect(q, '喜欢')).toBe(true);
    expect(isAnswerCorrect(q, '工作')).toBe(false);
  });

  it('pinyin-input normalizes both sides', () => {
    const q = mkQuestion({ type: 'pinyin-input', correctAnswer: 'xǐ huān' });
    expect(isAnswerCorrect(q, 'xi huan')).toBe(true);
    expect(isAnswerCorrect(q, 'xi3 huan1')).toBe(true);
    expect(isAnswerCorrect(q, 'XI HUAN')).toBe(true);
    expect(isAnswerCorrect(q, 'xi han')).toBe(false);
  });

  it('tone-recognition compares tone number string', () => {
    const q = mkQuestion({ type: 'tone-recognition', correctAnswer: '3' });
    expect(isAnswerCorrect(q, '3')).toBe(true);
    expect(isAnswerCorrect(q, ' 3 ')).toBe(true);
    expect(isAnswerCorrect(q, '4')).toBe(false);
  });

  it('character-assembly requires exact order', () => {
    const q = mkQuestion({ type: 'character-assembly', correctAnswer: '你好' });
    expect(isAnswerCorrect(q, '你好')).toBe(true);
    expect(isAnswerCorrect(q, '好你')).toBe(false);
  });

  it('cloze requires exact option match', () => {
    const q = mkQuestion({ type: 'cloze', correctAnswer: '喜欢' });
    expect(isAnswerCorrect(q, '喜欢')).toBe(true);
    expect(isAnswerCorrect(q, '工作')).toBe(false);
  });
});

describe('gradeAnswer', () => {
  it('builds a TestAnswerResult with all required fields', () => {
    const id = randomUUID();
    const wordId = randomUUID();
    const q = mkQuestion({ id, wordId, type: 'pinyin-input', correctAnswer: 'xǐ huān' });
    const result = gradeAnswer(q, 'xi3 huan1');
    expect(result.questionId).toBe(id);
    expect(result.userAnswer).toBe('xi3 huan1');
    expect(result.correctAnswer).toBe('xǐ huān');
    expect(result.isCorrect).toBe(true);
    expect(result.type).toBe('pinyin-input');
    expect(result.wordId).toBe(wordId);
    expect(result.wordCharacter).toBe('喜欢');
    expect(result.wordPinyin).toBe('xǐ huān');
    expect(result.wordTranslation).toBe('нравиться');
  });
});

describe('computeBreakdown', () => {
  it('groups correct answers by question type', () => {
    const questions: TestQuestion[] = [
      mkQuestion({ type: 'multiple-choice-translation' }),
      mkQuestion({ type: 'multiple-choice-translation' }),
      mkQuestion({ type: 'pinyin-input', correctAnswer: 'xǐ huān' }),
      mkQuestion({ type: 'tone-recognition', correctAnswer: '3' }),
    ];
    const results = [
      gradeAnswer(questions[0]!, 'нравиться'),
      gradeAnswer(questions[1]!, 'wrong'),
      gradeAnswer(questions[2]!, 'xi huan'),
      gradeAnswer(questions[3]!, '3'),
    ];

    const breakdown = computeBreakdown(questions, results);
    const byType = Object.fromEntries(breakdown.map((b) => [b.type, b]));

    expect(byType['multiple-choice-translation']).toEqual({
      type: 'multiple-choice-translation',
      correct: 1,
      total: 2,
    });
    expect(byType['pinyin-input']).toEqual({
      type: 'pinyin-input',
      correct: 1,
      total: 1,
    });
    expect(byType['tone-recognition']).toEqual({
      type: 'tone-recognition',
      correct: 1,
      total: 1,
    });
  });

  it('handles empty inputs', () => {
    expect(computeBreakdown([], [])).toEqual([]);
  });
});
