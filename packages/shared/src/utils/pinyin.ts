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

/**
 * Парсит строку пиньиня на слоги с тонами.
 * Пример: "xǐ huān" → [{syllable: "xǐ", tone: 3}, {syllable: "huān", tone: 1}]
 */
export function parsePinyin(pinyin: string): ToneSyllable[] {
  return pinyin
    .split(/\s+/)
    .filter(Boolean)
    .map((syllable) => {
      let tone: ToneNumber = 0;
      for (const char of syllable) {
        const t = detectTone(char);
        if (t !== 0) {
          tone = t;
          break;
        }
      }
      return { syllable, tone };
    });
}
