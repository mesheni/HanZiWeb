/**
 * Генерация короткого кода для шеринга колоды.
 * Алфавит исключает похожие символы (0/O, 1/I/L) для уменьшения ошибок при наборе.
 * Длина 6 символов даёт ~36^6 ≈ 2.2 млрд комбинаций.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DEFAULT_LENGTH = 6;

/**
 * Возвращает случайный код фиксированной длины.
 * Если `randomFn` передан — используется он (нужно для детерминированных тестов).
 */
export function generateShareCode(
  length: number = DEFAULT_LENGTH,
  randomFn: () => number = Math.random,
): string {
  if (length <= 0) {
    throw new Error('Share code length must be positive');
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(randomFn() * ALPHABET.length);
    out += ALPHABET[idx]!;
  }
  return out;
}

/** Валидация формата share-кода. */
export function isValidShareCode(code: string): boolean {
  if (typeof code !== 'string') return false;
  if (code.length < 4 || code.length > 16) return false;
  return /^[A-Z0-9]+$/.test(code);
}

/** Нормализация ввода пользователя: uppercase, обрезка пробелов. */
export function normalizeShareCode(code: string): string {
  return code.trim().toUpperCase();
}

export const SHARE_CODE_ALPHABET = ALPHABET;
