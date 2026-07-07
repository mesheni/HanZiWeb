import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useInfiniteWords } from '@/queries/words';
import { useAuthStore } from '@/stores/authStore';
import HandwritingPractice from '@/components/HandwritingPractice';
import { normalizePinyin } from '@/utils/pinyinNormalize';
import type { WordListItem } from '@hanzi/shared';

interface SelectedWord {
  character: string;
  pinyin?: string;
  translation?: string;
}

const HSK_CHIPS = [0, 1, 2, 3, 4, 5, 6] as const;
const STATUS_CHIPS = ['all', 'new', 'learning', 'review', 'graduated'] as const;

const STATUS_LABELS: Record<string, string> = {
  all: 'Все',
  new: 'Новые',
  learning: 'В процессе',
  review: 'На повторе',
  graduated: 'Выучено',
};

export default function HandwritingScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useAuthStore((s) => s.user?.id);
  const initialChar = searchParams.get('char') || '';
  const [selectedWord, setSelectedWord] = useState<SelectedWord | null>(
    initialChar
      ? {
          character: initialChar,
          pinyin: searchParams.get('pinyin') ?? undefined,
          translation: searchParams.get('translation') ?? undefined,
        }
      : null,
  );
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hskLevel, setHskLevel] = useState<number | null>(null);
  const [statusChip, setStatusChip] = useState<string>('all');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Серверные фильтры. status работает только при наличии userId
  // (listWords требует userId для фильтра по статусу прогресса).
  const statusFilter =
    statusChip !== 'all'
      ? (statusChip as 'new' | 'learning' | 'review' | 'graduated')
      : undefined;
  const filters = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(hskLevel !== null && hskLevel > 0 ? { hskLevel } : {}),
    ...(statusFilter && userId ? { status: statusFilter } : {}),
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteWords(filters);

  const allWords: WordListItem[] = useMemo(
    () => data?.pages.flatMap((p) => p.data ?? []) ?? [],
    [data],
  );
  const total = data?.pages?.[0]?.pagination?.total ?? 0;

  // Клиентский пост-фильтр по пиньиню с нормализацией диакритики.
  // Сервер делает только литеральный `contains` по пиньиню, поэтому
  // поиск «ai» сам по себе не найдёт «爱» (ài) — нормализация здесь
  // дозагружает такие совпадения из уже подтянутых страниц.
  const filteredWords = useMemo(() => {
    const q = debouncedSearch.trim();
    if (!q) return allWords;
    const qLower = q.toLowerCase();
    const qPinyin = normalizePinyin(q).replace(/\s+/g, '');
    return allWords.filter((w: WordListItem) => {
      if (w.character.includes(q) || w.character.toLowerCase().includes(qLower)) {
        return true;
      }
      if (w.translation.toLowerCase().includes(qLower)) {
        return true;
      }
      if (qPinyin) {
        const wPinyin = normalizePinyin(w.pinyin).replace(/\s+/g, '');
        if (wPinyin.includes(qPinyin)) return true;
      }
      return false;
    });
  }, [allWords, debouncedSearch]);

  const handleSelectWord = (word: WordListItem) => {
    setSelectedWord({
      character: word.character,
      pinyin: word.pinyin,
      translation: word.translation,
    });
  };

  // IntersectionObserver-триггер для подгрузки следующей страницы,
  // когда последняя карточка появляется в зоне видимости.
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastWordRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && hasNextPage) {
          void fetchNextPage();
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  );

  const filtersActive = hskLevel !== null || statusChip !== 'all' || debouncedSearch.trim() !== '';
  const isStatusFilterDisabled = !userId;

  return (
    <div className="handwriting-screen">
      <header className="handwriting-header">
        <button className="hw-back-btn" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft size={20} />
        </button>
        <h2 className="handwriting-title">Практика письма</h2>
      </header>

      <div className="handwriting-search">
        <Search size={16} className="hw-search-icon" />
        <input
          type="text"
          className="hw-search-input"
          placeholder="Иероглиф, пиньинь или перевод..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      <div className="handwriting-filters">
        <div className="handwriting-filter-row">
          <span className="handwriting-filter-label">HSK</span>
          {HSK_CHIPS.map((level) => {
            const active = hskLevel === (level === 0 ? null : level);
            return (
              <button
                key={level}
                type="button"
                className={`handwriting-chip${active ? ' handwriting-chip-active' : ''}`}
                onClick={() => setHskLevel(level === 0 ? null : level)}
              >
                {level === 0 ? 'Все' : `${level}`}
              </button>
            );
          })}
        </div>
        <div className="handwriting-filter-row">
          <span className="handwriting-filter-label">Статус</span>
          {STATUS_CHIPS.map((s) => {
            const active = statusChip === s;
            return (
              <button
                key={s}
                type="button"
                className={`handwriting-chip${active ? ' handwriting-chip-active' : ''}`}
                onClick={() => setStatusChip(s)}
                disabled={isStatusFilterDisabled && s !== 'all'}
                title={isStatusFilterDisabled ? 'Войдите, чтобы фильтровать по статусу' : undefined}
              >
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      {selectedWord ? (
        <div className="handwriting-main">
          <HandwritingPractice
            character={selectedWord.character}
            pinyin={selectedWord.pinyin}
            translation={selectedWord.translation}
            key={selectedWord.character}
          />
          <button className="hw-close-char" onClick={() => setSelectedWord(null)}>
            Выбрать другой иероглиф
          </button>
        </div>
      ) : (
        <>
          <div className="handwriting-list">
            {filteredWords.map((word, idx) => {
              const isLast = idx === filteredWords.length - 1;
              return (
                <div
                  key={word.id}
                  ref={isLast ? lastWordRef : null}
                  className="handwriting-word"
                >
                  <div className="handwriting-word-chars">
                    {Array.from(word.character).map((char, i) => (
                      <button
                        key={`${word.id}-${i}`}
                        type="button"
                        className="handwriting-char"
                        onClick={() => handleSelectWord(word)}
                        title={`${word.pinyin} — ${word.translation}`}
                        aria-label={`${word.pinyin} — ${word.translation}`}
                      >
                        {char}
                      </button>
                    ))}
                  </div>
                  <div className="handwriting-word-meta">
                    <span className="handwriting-word-pinyin">{word.pinyin}</span>
                    <span className="handwriting-word-translation">{word.translation}</span>
                  </div>
                </div>
              );
            })}
            {!isLoading && filteredWords.length === 0 && (
              <p className="hw-empty">
                {filtersActive ? 'Ничего не найдено' : 'Список слов пуст'}
              </p>
            )}
            {isFetchingNextPage && (
              <div className="handwriting-list-loading">
                <span className="spinner" />
              </div>
            )}
          </div>

          {hasNextPage && !isFetchingNextPage && (
            <div className="handwriting-load-more-wrap">
              <button
                type="button"
                className="hw-btn hw-btn-outline"
                onClick={() => void fetchNextPage()}
              >
                Загрузить ещё
              </button>
              <span className="handwriting-count">
                Загружено {filteredWords.length} из {total}
              </span>
            </div>
          )}
          {!hasNextPage && !isLoading && filteredWords.length > 0 && (
            <div className="handwriting-load-more-wrap">
              <span className="handwriting-count">
                Всего {filteredWords.length} {filteredWords.length === 1 ? 'слово' : 'слов'}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
