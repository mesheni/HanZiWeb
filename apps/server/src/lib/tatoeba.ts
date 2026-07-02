/**
 * Минимальный клиент для Tatoeba API (https://api.tatoeba.org).
 *
 * Используется для сидинга примеров предложений и для опционального
 * ручного импорта через `POST /words/:id/examples/fetch`.
 *
 * Документация (v1, unauthenticated): https://tatoeba.org/eng/api
 *  - https://api.tatoeba.org/v1/sentences?lang=cmn&trans_lang=rus&word=爱
 *  - https://api.tatoeba.org/v1/sentences/{id}/translations?lang=rus
 */

const TATOEBA_BASE = 'https://api.tatoeba.org/v1';

export interface TatoebaSentence {
  id: number;
  text: string;
  lang: string;
  license?: string;
  script?: string;
  /** Присутствует при запросе с `trans_lang` (см. getSentencesWithTranslations). */
  translations?: TatoebaTranslation[];
}

export interface TatoebaTranslation {
  id: number;
  text: string;
  lang: string;
  license?: string;
  script?: string;
}

interface TatoebaListResponse {
  data: TatoebaSentence[];
  paging?: {
    total?: number;
    sentCount?: number;
    transCount?: number;
  };
}

interface RequestOptions {
  /** Количество секунд до таймаута. */
  timeoutMs?: number;
  /** Заголовок User-Agent (Tatoeba приветствует идентификацию). */
  userAgent?: string;
}

class TatoebaError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TatoebaError';
  }
}

async function tatoebaFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = 10_000, userAgent = 'HanZiWeb/0.1 (https://hanzi.app)' } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${TATOEBA_BASE}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': userAgent },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new TatoebaError(res.status, `Tatoeba ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Возвращает дочерние предложения на `lang` с параллельными переводами на `transLang`.
 *
 * Пример: `getSentencesWithTranslations({ word: '爱', lang: 'cmn', transLang: 'rus', limit: 10 })`.
 */
export async function getSentencesWithTranslations(params: {
  word: string;
  lang: string;
  transLang: string;
  limit?: number;
}): Promise<TatoebaSentence[]> {
  const search = new URLSearchParams({
    word: params.word,
    lang: params.lang,
    trans_lang: params.transLang,
    limit: String(params.limit ?? 10),
  });
  const res = await tatoebaFetch<TatoebaListResponse>(`/sentences?${search.toString()}`);
  return res.data ?? [];
}

/**
 * Возвращает прямые переводы (любые языки) для одного предложения.
 * Используется, когда у нас уже есть sentence id, но без переводов.
 */
export async function getTranslationsForSentence(
  sentenceId: number,
  lang: string,
): Promise<TatoebaTranslation[]> {
  const res = await tatoebaFetch<TatoebaListResponse>(
    `/sentences/${sentenceId}/translations?lang=${encodeURIComponent(lang)}`,
  );
  return (res.data ?? []) as TatoebaTranslation[];
}

/**
 * Берёт первый русский перевод из списка. Может вернуть null, если переводов нет.
 */
export function pickRussianTranslation(
  sentence: TatoebaSentence,
  russianLang = 'rus',
): TatoebaTranslation | null {
  const list = sentence.translations ?? [];
  return list.find((t) => t.lang === russianLang) ?? null;
}

export { TatoebaError };
