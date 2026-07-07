interface TrieNode {
  children: Map<string, TrieNode>;
  wordId?: string;
}

export interface WordEntry {
  id: string;
  character: string;
  hskLevel: number | null;
}

export interface TextToken {
  position: number;
  length: number;
  wordId: string;
  surface: string;
}

export function buildTrie(words: readonly WordEntry[]): TrieNode {
  const root: TrieNode = { children: new Map() };
  for (const word of words) {
    let node = root;
    for (const char of word.character) {
      let next = node.children.get(char);
      if (!next) {
        next = { children: new Map() };
        node.children.set(char, next);
      }
      node = next;
    }
    node.wordId = word.id;
  }
  return root;
}

export function tokenize(text: string, trie: TrieNode): TextToken[] {
  const tokens: TextToken[] = [];
  let index = 0;

  while (index < text.length) {
    let node = trie;
    let cursor = index;
    let matchedLength = 0;
    let matchedWordId: string | undefined;

    while (cursor < text.length) {
      const ch = text.charAt(cursor);
      const next = node.children.get(ch);
      if (!next) {
        break;
      }
      node = next;
      cursor += 1;
      if (node.wordId !== undefined) {
        matchedLength = cursor - index;
        matchedWordId = node.wordId;
      }
    }

    if (matchedLength > 0 && matchedWordId !== undefined) {
      tokens.push({
        position: index,
        length: matchedLength,
        wordId: matchedWordId,
        surface: text.slice(index, index + matchedLength),
      });
      index += matchedLength;
    } else {
      index += 1;
    }
  }

  return tokens;
}
