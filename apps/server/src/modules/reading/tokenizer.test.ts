import { describe, it, expect } from 'vitest';
import { buildTrie, tokenize } from './tokenizer.js';
import type { WordEntry } from './tokenizer.js';

const toEntries = (map: Record<string, string>): WordEntry[] =>
  Object.entries(map).map(([character, id]) => ({ id, character, hskLevel: 1 }));

describe('tokenize', () => {
  it('returns empty array for empty text', () => {
    const trie = buildTrie(toEntries({ 你好: 'w1' }));
    expect(tokenize('', trie)).toEqual([]);
  });

  it('matches a single-character word', () => {
    const trie = buildTrie(toEntries({ 我: 'w1' }));
    expect(tokenize('我', trie)).toEqual([
      { position: 0, length: 1, wordId: 'w1', surface: '我' },
    ]);
  });

  it('matches a multi-character word', () => {
    const trie = buildTrie(toEntries({ 你好: 'w1' }));
    expect(tokenize('你好', trie)).toEqual([
      { position: 0, length: 2, wordId: 'w1', surface: '你好' },
    ]);
  });

  it('prefers the longest match', () => {
    const trie = buildTrie(toEntries({ 学: 'w1', 学生: 'w2' }));
    expect(tokenize('我是学生', trie)).toEqual([
      { position: 2, length: 2, wordId: 'w2', surface: '学生' },
    ]);
  });

  it('skips unknown characters', () => {
    const trie = buildTrie(toEntries({ 你好: 'w1' }));
    expect(tokenize('X你好！', trie)).toEqual([
      { position: 1, length: 2, wordId: 'w1', surface: '你好' },
    ]);
  });

  it('emits consecutive tokens', () => {
    const trie = buildTrie(toEntries({ 我: 'w1', 喜欢: 'w2', 咖啡: 'w3' }));
    expect(tokenize('我喜欢咖啡', trie)).toEqual([
      { position: 0, length: 1, wordId: 'w1', surface: '我' },
      { position: 1, length: 2, wordId: 'w2', surface: '喜欢' },
      { position: 3, length: 2, wordId: 'w3', surface: '咖啡' },
    ]);
  });

  it('handles overlapping candidates by greedy longest match', () => {
    const trie = buildTrie(toEntries({ 中国人: 'w1', 国: 'w2', 中国: 'w3' }));
    expect(tokenize('我是中国人', trie)).toEqual([
      { position: 2, length: 3, wordId: 'w1', surface: '中国人' },
    ]);
  });
});
