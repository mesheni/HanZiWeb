/**
 * Разбор пиньиня на слоги с тонами (чистая логика, web + mobile).
 * Цветовое оформление тонов — забота потребителя (CSS-переменные на web,
 * палитра в RN).
 */

export type ToneNumber = 0 | 1 | 2 | 3 | 4;

/** Слог с определённым тоном */
export interface ToneSyllable {
  syllable: string;
  tone: ToneNumber;
}

/**
 * Определяет тон по диакритическому знаку:
 *   ā ē ī ō ū ǖ → 1
 *   á é í ó ú ǘ → 2
 *   ǎ ě ǐ ǒ ǔ ǚ → 3
 *   à è ì ò ù ǜ → 4
 *   a e i o u ü → 0 (нейтральный)
 */
function detectTone(char: string): ToneNumber {
  const tone1 = 'āēīōūǖĀĒĪŌŪǕ';
  const tone2 = 'áéíóúǘÁÉÍÓÚǗ';
  const tone3 = 'ǎěǐǒǔǚǍĚǏǑǓǙ';
  const tone4 = 'àèìòùǜÀÈÌÒÙǛ';
  if (tone1.includes(char)) return 1;
  if (tone2.includes(char)) return 2;
  if (tone3.includes(char)) return 3;
  if (tone4.includes(char)) return 4;
  return 0;
}

const TONE_CHAR = '[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]';
const DIPHTHONG_VOWEL = '[aeoiuüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]';
const CONSONANT = '[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]';
const ALPHA_OR_TONE = '[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]';

function toSyllable(raw: string): ToneSyllable {
  let tone: ToneNumber = 0;
  for (const char of raw) {
    const t = detectTone(char);
    if (t !== 0) {
      tone = t;
      break;
    }
  }
  return { syllable: raw, tone };
}

/**
 * Разбор склеенного пиньиня (без пробелов и `//`). Каждый тон-маркер задаёт
 * ядро слога; собираем согласные перед ним (инициали) + одну гласную-медиаль
 * перед согласными, после маркера тона — остаток ядра и опциональное
 *鼻韵尾 `n`/`ng`. `y`/`w` трактуем как согласные: они открывают новый слог
 * (`y` = пиньинь-i, `w` = пиньинь-u).
 */
function splitGluedPinyin(s: string): ToneSyllable[] {
  const toneRe = new RegExp(TONE_CHAR, 'g');
  const vowelRe = new RegExp(DIPHTHONG_VOWEL);
  const consonantRe = new RegExp(CONSONANT);
  const alphaRe = new RegExp(ALPHA_OR_TONE, 'gi');

  const syllables: ToneSyllable[] = [];
  let i = 0;
  while (i < s.length) {
    toneRe.lastIndex = i;
    const toneMatch = toneRe.exec(s);
    if (!toneMatch) {
      const rest = s.slice(i).match(alphaRe)?.join('') ?? '';
      if (rest) syllables.push(toSyllable(rest));
      break;
    }
    const tonePos = toneMatch.index;

    let start = tonePos;
    let didTakeMedial = false;
    while (start > i) {
      const prev = s[start - 1]!;
      if (consonantRe.test(prev)) {
        start--;
      } else if (!didTakeMedial && vowelRe.test(prev)) {
        if (start - 1 > i && consonantRe.test(s[start - 2]!)) {
          start--;
          didTakeMedial = true;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    let end = tonePos + 1;
    while (end < s.length && vowelRe.test(s[end]!)) {
      end++;
    }
    if (s[end] === 'n' || s[end] === 'N') {
      end++;
      if (s[end] === 'g' || s[end] === 'G') {
        end++;
      }
    }

    syllables.push(toSyllable(s.slice(start, end)));
    i = end;
  }

  return syllables;
}

/**
 * Парсит строку пиньиня на слоги с тонами.
 *
 * Поддерживает три формы записи:
 *   - "xǐ huān"            — пробелы (эталон)
 *   - "ài//guó" / "ài/guó" — `//` или `/` как явный слоговый разделитель
 *     (встречается в импортированных словарях, где пробелы были утеряны)
 *   - "báitiān"            — склеенный пиньинь; разбивается по позициям
 *     тон-маркеров эвристикой в {@link splitGluedPinyin}.
 *
 * Примеры:
 *   "xǐ huān"  → [{syllable: "xǐ", tone: 3}, {syllable: "huān", tone: 1}]
 *   "báitiān"  → [{syllable: "bái", tone: 2}, {syllable: "tiān", tone: 1}]
 *   "ài//guó"  → [{syllable: "ài", tone: 4}, {syllable: "guó", tone: 2}]
 */
export function parsePinyin(pinyin: string): ToneSyllable[] {
  const withSlashAsSpace = pinyin.replace(/\/+/g, ' ');

  if (/\s/.test(withSlashAsSpace)) {
    return withSlashAsSpace
      .split(/\s+/)
      .filter(Boolean)
      .map(toSyllable);
  }

  return splitGluedPinyin(withSlashAsSpace);
}
