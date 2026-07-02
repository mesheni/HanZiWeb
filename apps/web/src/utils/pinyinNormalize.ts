/**
 * Нормализация пиньиня для сравнения пользовательского ввода с эталоном.
 * Снимает диакритику с тонов, схлопывает пробелы, приводит к lowercase.
 *
 * Пример:
 *   "xǐ huān" → "xi huan"
 *   "xi3 huan1" → "xi huan"
 */
export function normalizePinyin(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // убираем combining marks
    .replace(/[1-4]/g, '') // цифровые тона (ni3 hao3 → ni hao)
    .replace(/[^a-zü0-9\s]/g, ' ') // всё, что не буква/пробел → пробел
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Сравнивает две строки пиньиня без учёта тонов и регистра.
 * Допускает «пробел или его отсутствие» между слогами.
 */
export function pinyinEquals(a: string, b: string): boolean {
  const na = normalizePinyin(a).replace(/\s+/g, '');
  const nb = normalizePinyin(b).replace(/\s+/g, '');
  return na === nb && na.length > 0;
}

/**
 * Сравнивает послогово. Возвращает массив флагов правильности слогов.
 * Используется для подсветки «правильно/неправильно» в UI.
 */
export function pinyinSyllableMatches(input: string, target: string): boolean[] {
  const a = normalizePinyin(input).split(' ').filter(Boolean);
  const b = normalizePinyin(target).split(' ').filter(Boolean);
  const max = Math.max(a.length, b.length);
  const result: boolean[] = [];
  for (let i = 0; i < max; i++) {
    result.push((a[i] ?? '') === (b[i] ?? ''));
  }
  return result;
}
