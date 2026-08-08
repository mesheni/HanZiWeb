/**
 * Рекурсивно приводит BigInt к JSON-сериализуемым значениям.
 *
 * `JSON.stringify` выбрасывает TypeError на BigInt — до фикса F01 это
 * превращало любой ответ с примерами (`Example.tatoebaId` — Prisma BigInt)
 * в 500 на всех word/example/session эндпоинтах. Значения в пределах
 * safe-integer диапазона становятся number (публичный контракт
 * `ExampleSchema.tatoebaId` — `z.number().int()`), большие — строкой,
 * чтобы не терять точность.
 *
 * Функция возвращает исходную ссылку, если BigInt в payload нет, — для
 * остальных ответов накладные расходы нулевые.
 */
export function normalizeBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const min = BigInt(Number.MIN_SAFE_INTEGER);
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    return value >= min && value <= max ? Number(value) : value.toString();
  }
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const next = normalizeBigInts(item);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? items : value;
  }
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    // Нормализуем только plain objects; Date и другие классы не трогаем —
    // их сериализует собственный toJSON.
    if (proto !== Object.prototype && proto !== null) return value;
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const next = normalizeBigInts(item);
      if (next !== item) changed = true;
      out[key] = next;
    }
    return changed ? out : value;
  }
  return value;
}
