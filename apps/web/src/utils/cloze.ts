import type { ClozeQuestion, Example } from '@hanzi/shared';

/**
 * Маркер пропуска в cloze-предложении. Длина подобрана так, чтобы
 * строка помещалась в одну «клетку» UI и легко искалась в тексте.
 */
export const CLOZE_MARKER = '____';

/**
 * Достаёт из примера первое вхождение `word.character` (или `word.pinyin`,
 * если иероглифов в предложении нет) и заменяет его маркером.
 *
 * Возвращает `null`, если слово не найдено в предложении — это сигнал
 * UI пропустить такой пример.
 *
 * @param example  — китайский + русский примеры.
 * @param word     — слово, которое нужно спрятать.
 * @param fallbackToPinyin  — пробовать ли заменить пиньинь вместо иероглифов.
 *                            Полезно для слов, в предложениях которых иероглиф
 *                            не встречается напрямую.
 */
export function buildClozeQuestion(
  example: Pick<Example, 'id' | 'chinese' | 'russian'>,
  word: { character: string; pinyin: string },
  fallbackToPinyin = true,
): ClozeQuestion | null {
  const sentence = example.chinese.trim();
  const answer = word.character.trim();

  if (answer && sentence.includes(answer)) {
    const clozeSentence = sentence.replace(answer, CLOZE_MARKER);
    return {
      exampleId: example.id,
      sentence,
      clozeSentence,
      answer,
      hint: example.russian,
    };
  }

  if (fallbackToPinyin) {
    // Берём первый слог пиньиня (без тона) — он встречается в предложениях,
    // где иероглиф написан транслитом (например, в Tatoeba).
    const pinyin = normalizePinyinKey(word.pinyin);
    if (pinyin && sentence.toLowerCase().includes(pinyin.toLowerCase())) {
      const clozeSentence = replaceCaseInsensitive(sentence, pinyin, CLOZE_MARKER);
      return {
        exampleId: example.id,
        sentence,
        clozeSentence,
        answer: pinyin,
        hint: example.russian,
      };
    }
  }

  return null;
}

function replaceCaseInsensitive(haystack: string, needle: string, replacement: string): string {
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return haystack;
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

/**
 * Нормализует пиньинь для сравнения со строкой предложения:
 *  - выкидывает цифровые тоны 1-4,
 *  - NFD + strip комбинирующих диакритик (`ǎ` → `a`).
 */
function normalizePinyinKey(pinyin: string): string {
  const first = pinyin
    .replace(/[1-4]/g, '')
    .split(/\s+/)
    .filter(Boolean)[0];
  if (!first) return '';
  return first
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Простая проверка ответа пользователя в cloze-карточке. */
export function checkClozeAnswer(input: string, expected: string): boolean {
  const a = normalizeForCompare(input);
  const b = normalizeForCompare(expected);
  return a === b;
}

function normalizeForCompare(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[.,!?;:。！？，；：、"'`()\[\]…—\-]/g, '')
    .toLowerCase()
    .trim();
}
