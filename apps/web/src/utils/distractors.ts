import type { Word } from '@hanzi/shared';

/**
 * Fisher–Yates shuffle. Возвращает новый массив, исходный не мутирует.
 * Используем `Math.random()` — криптостойкость не нужна, важна равномерность.
 */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function uniqueBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/**
 * Сгенерировать варианты для multiple-choice (выбор перевода).
 * Возвращает массив длиной 1..count, содержащий правильный ответ
 * и 3 дистрактора из пула. Если в пуле меньше 3 дистракторов, возвращает
 * столько, сколько возможно.
 */
export function buildMultipleChoiceOptions(
  correct: Word,
  pool: Word[],
  count = 4,
): Word[] {
  const distractors = uniqueBy(
    pool.filter((w) => w.id !== correct.id && w.translation !== correct.translation),
    (w) => w.id,
  );
  const picked = shuffle(distractors).slice(0, count - 1);
  return shuffle([correct, ...picked]);
}

/**
 * Варианты для reverse-choice: пользователь видит русский перевод,
 * выбирает китайский иероглиф. Возвращает count слов (включая correct).
 */
export function buildReverseChoiceOptions(
  correct: Word,
  pool: Word[],
  count = 4,
): Word[] {
  const distractors = uniqueBy(
    pool.filter((w) => w.id !== correct.id && w.character !== correct.character),
    (w) => w.id,
  );
  const picked = shuffle(distractors).slice(0, count - 1);
  return shuffle([correct, ...picked]);
}

/**
 * Сгенерировать пул слогов пиньиня для syllable-constructor.
 * Берёт слоги правильного ответа и добавляет distractor-слоги из пула.
 */
export function buildSyllablePool(
  correctPinyin: string,
  distractorPinyin: string[],
  extraCount = 3,
): string[] {
  const correct = correctPinyin.split(/\s+/).filter(Boolean);
  const others = distractorPinyin
    .flatMap((p) => p.split(/\s+/))
    .filter((s) => s && !correct.includes(s));
  const extras = shuffle(others).slice(0, extraCount);
  return shuffle([...correct, ...extras]);
}
