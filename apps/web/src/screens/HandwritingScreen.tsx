import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useWords } from '@/queries/words';
import HandwritingPractice from '@/components/HandwritingPractice';
import { normalizePinyin } from '@/utils/pinyinNormalize';
import type { WordListItem } from '@hanzi/shared';

interface SelectedWord {
  character: string;
  pinyin?: string;
  translation?: string;
}

export default function HandwritingScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Загружаем слова один раз (серверный limit = 100). Дальнейшая фильтрация —
  // на клиенте, по иероглифу / пиньиню / переводу. queryKey стабилен, поэтому
  // ввод в поиске не триггерит рефетч.
  const { data: wordsResponse, isLoading } = useWords({ limit: 100 });
  const allWords = wordsResponse?.data ?? [];

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
        <div className="handwriting-list">
          {filteredWords.map((word) => (
            <div key={word.id} className="handwriting-word">
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
          ))}
          {!isLoading && filteredWords.length === 0 && (
            <p className="hw-empty">
              {debouncedSearch.trim() ? 'Ничего не найдено' : 'Список слов пуст'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
