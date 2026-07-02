import { describe, it, expect } from 'vitest';
import { buildClozeQuestion, checkClozeAnswer, CLOZE_MARKER } from './cloze';
import type { Example } from '@hanzi/shared';

const baseExample: Pick<Example, 'id' | 'chinese' | 'russian'> = {
  id: '00000000-0000-0000-0000-000000000001',
  chinese: '我爱学习中文。',
  russian: 'Я люблю изучать китайский.',
};

describe('buildClozeQuestion', () => {
  it('masks the first occurrence of the word character', () => {
    const q = buildClozeQuestion(baseExample, { character: '爱', pinyin: 'ài' });
    expect(q).not.toBeNull();
    expect(q?.clozeSentence).toBe(`我${CLOZE_MARKER}学习中文。`);
    expect(q?.answer).toBe('爱');
    expect(q?.sentence).toBe(baseExample.chinese);
    expect(q?.hint).toBe(baseExample.russian);
  });

  it('returns null when the character is not in the sentence', () => {
    const q = buildClozeQuestion(baseExample, { character: '书', pinyin: 'shū' });
    expect(q).toBeNull();
  });

  it('falls back to the first pinyin syllable if character is missing', () => {
    const ex = { ...baseExample, chinese: 'wo ai xuexi zhongwen.' };
    const q = buildClozeQuestion(ex, { character: '爱', pinyin: 'ài' });
    expect(q).not.toBeNull();
    expect(q?.clozeSentence.toLowerCase()).toContain(CLOZE_MARKER.toLowerCase());
    expect(q?.answer).toBe('ai');
  });

  it('respects fallbackToPinyin=false (returns null when character is missing)', () => {
    const q = buildClozeQuestion(
      baseExample,
      { character: '书', pinyin: 'shū' },
      false,
    );
    expect(q).toBeNull();
  });

  it('uses only the first pinyin syllable as the fallback key', () => {
    // Первый слог пиньиня «wo» — не встречается как самостоятельный токен
    // (есть только в "wo shi"), но includes() найдёт его как подстроку.
    // Главное — что в предложении есть первый слог, и он маскируется.
    const ex = { ...baseExample, chinese: 'wo ai zhongguo' };
    const q = buildClozeQuestion(ex, { character: '我', pinyin: 'wǒ' });
    expect(q).not.toBeNull();
    expect(q?.answer).toBe('wo');
    expect(q?.clozeSentence).toBe(`${CLOZE_MARKER} ai zhongguo`);
  });
});

describe('checkClozeAnswer', () => {
  it('accepts exact match', () => {
    expect(checkClozeAnswer('爱', '爱')).toBe(true);
  });

  it('is case-insensitive for pinyin answers', () => {
    expect(checkClozeAnswer('AI', 'ai')).toBe(true);
  });

  it('strips punctuation and whitespace', () => {
    expect(checkClozeAnswer(' 爱。', '爱')).toBe(true);
    expect(checkClozeAnswer('ai,', 'ai')).toBe(true);
  });

  it('rejects different characters', () => {
    expect(checkClozeAnswer('恨', '爱')).toBe(false);
  });
});
