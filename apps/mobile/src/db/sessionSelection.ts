/**
 * F21: чистая логика построения офлайн-сессии из локальных данных
 * (WatermelonDB). Отделена от WatermelonDB, чтобы быть тестируемой в
 * Node: вход — plain-массивы слов и прогресса, выход — карточки.
 *
 * Семантика как у серверного `/sessions/start`: сначала слова, у
 * которых dueDate наступил (включая новые с просроченным dueDate),
 * затем новые слова без записи прогресса (если includeNew).
 */

export interface LocalWord {
  id: string;
  character: string;
  pinyin: string;
  translation: string;
}

export interface LocalProgress {
  wordId: string;
  state: string;
  stability: number;
  difficulty: number;
  dueDate: string;
}

export interface LocalCard {
  word: LocalWord;
  state: string;
  stability: number;
  difficulty: number;
}

export interface SelectLocalCardsOptions {
  cardLimit: number;
  includeNew: boolean;
  now?: number;
}

export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function selectLocalCards(
  words: readonly LocalWord[],
  progress: readonly LocalProgress[],
  options: SelectLocalCardsOptions,
): LocalCard[] {
  const now = options.now ?? Date.now();
  const progressByWord = new Map(progress.map((p) => [p.wordId, p]));

  const due: LocalWord[] = [];
  const fresh: LocalWord[] = [];
  for (const word of words) {
    const p = progressByWord.get(word.id);
    if (p && Date.parse(p.dueDate) <= now) {
      due.push(word);
    } else if (!p && options.includeNew) {
      fresh.push(word);
    }
  }

  const pick = (pool: LocalWord[]): LocalCard[] =>
    pool.map((word) => {
      const p = progressByWord.get(word.id);
      return {
        word,
        state: p?.state ?? 'new',
        stability: p?.stability ?? 0,
        difficulty: p?.difficulty ?? 5,
      };
    });

  const cards = [...shuffle(due), ...shuffle(fresh)];
  return pick(cards).slice(0, Math.max(0, options.cardLimit));
}
