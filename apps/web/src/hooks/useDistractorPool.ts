import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Word } from '@hanzi/shared';

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

interface UseDistractorPoolOptions {
  /** Сколько случайных слов вернуть. */
  count?: number;
  /** Включать ли запрос. */
  enabled?: boolean;
}

/**
 * Хук для получения пула случайных слов — используется для генерации
 * дистракторов в multiple-choice / reverse-choice / syllable-constructor
 * практиках.
 *
 * Пул НЕ зависит от конкретной карточки: исключение id делается
 * клиентом (в карточках) — это позволяет переиспользовать один и тот же
 * пул между карточками и не плодить запросы на каждое слово.
 */
export function useDistractorPool({ count = 24, enabled = true }: UseDistractorPoolOptions = {}) {
  return useQuery({
    queryKey: ['distractor-pool', count],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('count', String(count));
      // `apiGet` сам разворачивает `data` из ответа `{ success, data, … }`.
      return apiGet<Word[]>(`/sessions/random-words?${params.toString()}`);
    },
    enabled,
    // Кэшируем надолго — словарь статичен, можно подмешивать из сессии.
    staleTime: 5 * 60_000,
  });
}

/**
 * Возвращает случайные иероглифы из других слов пула, не пересекающиеся
 * с иероглифами целевого слова. Используется в режиме `character_assembly`.
 */
export function getCharacterDistractors(word: Word, pool: Word[], count = 6): string[] {
  const targetChars = new Set(Array.from(word.character));
  const candidates = [
    ...new Set(
      pool
        .filter((w) => w.id !== word.id)
        .flatMap((w) => Array.from(w.character))
        .filter((ch) => !targetChars.has(ch)),
    ),
  ];
  return shuffle(candidates).slice(0, count);
}
