import type { Etymology } from '@hanzi/shared';
import { ETYMOLOGY_DICTIONARY, hasDictionaryEntry } from './characters.js';

/**
 * Пустая «заглушка» для иероглифов, которых нет в словаре.
 * Не падает — возвращает `found: false`, чтобы UI мог показать
 * «нет данных по этому иероглифу».
 */
function emptyEtymology(character: string, pinyin: string | null): Etymology {
  return {
    character,
    pinyin,
    strokeCount: null,
    radical: null,
    structure: 'simple',
    components: [],
    etymology: null,
    mnemonic: null,
    found: false,
  };
}

/**
 * Достаёт этимологию одного иероглифа.
 *
 * Если иероглиф в словаре есть — собирает полную карточку
 * (радикал, структура, компоненты, история, мнемоника).
 * Если нет — возвращает «пустую» с `found: false`.
 *
 * @param character   иероглиф (для слов из нескольких иероглифов — клиент
 *                    сам решает, какой брать; мы берём первый, переданный).
 * @param pinyin      пиньинь из `Word.pinyin` (для контекста в карточке).
 */
export function lookupEtymology(character: string, pinyin: string | null = null): Etymology {
  const ch = (character ?? '').trim();
  if (!ch) {
    return emptyEtymology('', pinyin);
  }

  // Берём первый иероглиф из строки (для слов вида "喜欢" → "喜").
  const firstChar = Array.from(ch)[0] ?? '';
  if (!hasDictionaryEntry(firstChar)) {
    return emptyEtymology(firstChar, pinyin);
  }

  const entry = ETYMOLOGY_DICTIONARY[firstChar]!;
  return {
    character: firstChar,
    pinyin,
    strokeCount: entry.strokeCount,
    radical: { ...entry.radical },
    structure: entry.structure,
    components: entry.components.map((c) => ({ ...c })),
    etymology: entry.etymology,
    mnemonic: entry.mnemonic,
    found: true,
  };
}

/**
 * Достаёт этимологию для всех уникальных иероглифов слова.
 * Используется, если в будущем понадобится «multi-character» карточка.
 */
export function lookupAllEtymologies(text: string): Etymology[] {
  const seen = new Set<string>();
  const out: Etymology[] = [];
  for (const ch of Array.from(text)) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(lookupEtymology(ch));
  }
  return out;
}
