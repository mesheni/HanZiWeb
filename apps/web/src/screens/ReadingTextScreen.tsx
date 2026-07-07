import { useMemo, useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Languages,
  BookOpen,
  Star,
  Check,
} from 'lucide-react';
import { useReadingText, useAddPriorityWords, useMarkTextRead } from '../queries/reading';
import ReadingWord from '../components/reading/ReadingWord';
import WordTooltip from '../components/reading/WordTooltip';
import { PinyinDisplay } from '../utils/toneColors';
import type { ReadingToken } from '@hanzi/shared';

interface ParagraphData {
  text: string;
  start: number;
  tokens: ReadingToken[];
}

export default function ReadingTextScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: text, isLoading } = useReadingText(id ?? '');
  const addPriority = useAddPriorityWords(id ?? '');
  const markRead = useMarkTextRead(id ?? '');

  const [showPinyin, setShowPinyin] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showDictionary, setShowDictionary] = useState(false);
  const [activeToken, setActiveToken] = useState<ReadingToken | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const paragraphs = useMemo<ParagraphData[]>(() => {
    if (!text) return [];
    const result: ParagraphData[] = [];
    let offset = 0;
    for (const paragraph of text.paragraphs) {
      const start = offset;
      const paraTokens = text.tokens.filter(
        (t) => t.position >= start && t.position < start + paragraph.length,
      );
      result.push({ text: paragraph, start, tokens: paraTokens });
      offset += paragraph.length + 2; // \n\n between paragraphs
    }
    return result;
  }, [text]);

  const unknownWords = useMemo(() => {
    if (!text) return [];
    const seen = new Set<string>();
    return text.tokens.filter((t) => {
      if (!t.word) return false;
      if (t.state === 'graduated') return false;
      if (seen.has(t.word.id ?? '')) return false;
      seen.add(t.word.id ?? '');
      return true;
    });
  }, [text]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.reading-word') && !target.closest('.reading-tooltip')) {
        setActiveToken(null);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleWordClick = (token: ReadingToken, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveToken(token);
    setTooltipPos({ x: e.clientX + 12, y: e.clientY + 12 });
  };

  const handleSpeak = (character: string) => {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(character);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const handleAddPriority = (wordId: string) => {
    addPriority.mutate([wordId]);
  };

  if (isLoading || !text) {
    return (
      <div className="reading-text-screen">
        <div className="reading-empty">Загрузка текста...</div>
      </div>
    );
  }

  return (
    <div className="reading-text-screen" ref={containerRef}>
      <div className="reading-text-toolbar">
        <button
          type="button"
          className="reading-toolbar-btn"
          onClick={() => navigate('/reading')}
          aria-label="Назад"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="reading-text-title">{text.title}</div>
        <div className="reading-toolbar-actions">
          <button
            type="button"
            className={`reading-toolbar-btn${showPinyin ? ' reading-toolbar-btn-active' : ''}`}
            onClick={() => setShowPinyin((s) => !s)}
            title="Показать пиньинь"
          >
            {showPinyin ? <Eye size={16} /> : <EyeOff size={16} />}
            <span>Пиньинь</span>
          </button>
          <button
            type="button"
            className={`reading-toolbar-btn${showTranslation ? ' reading-toolbar-btn-active' : ''}`}
            onClick={() => setShowTranslation((s) => !s)}
            title="Показать перевод"
          >
            <Languages size={16} />
            <span>Перевод</span>
          </button>
          <button
            type="button"
            className={`reading-toolbar-btn${showDictionary ? ' reading-toolbar-btn-active' : ''}`}
            onClick={() => setShowDictionary((s) => !s)}
            title="Словарь"
          >
            <BookOpen size={16} />
            <span>Словарь</span>
          </button>
          <button
            type="button"
            className="reading-toolbar-btn"
            onClick={() => markRead.mutate()}
            title="Отметить как прочитанное"
            disabled={!!text.readAt}
          >
            <Check size={16} />
            <span>{text.readAt ? 'Прочитано' : 'Прочитал'}</span>
          </button>
        </div>
      </div>

      <div className={`reading-text-body${showDictionary ? ' reading-text-body--dictionary' : ''}`}>
        <div className="reading-text-content">
          {paragraphs.map((paragraph, pIndex) => {
            const rendered: React.ReactNode[] = [];
            let cursor = 0;
            for (const token of paragraph.tokens) {
              const localPos = token.position - paragraph.start;
              if (localPos > cursor) {
                rendered.push(
                  <span key={`g-${pIndex}-${cursor}`}>
                    {paragraph.text.slice(cursor, localPos)}
                  </span>,
                );
              }
              rendered.push(
                <ReadingWord
                  key={`w-${pIndex}-${token.position}`}
                  token={token}
                  showPinyin={showPinyin}
                  onClick={(t) =>
                    handleWordClick(t, {
                      clientX: tooltipPos.x,
                      clientY: tooltipPos.y,
                    } as React.MouseEvent)
                  }
                />,
              );
              cursor = localPos + token.length;
            }
            if (cursor < paragraph.text.length) {
              rendered.push(
                <span key={`g-${pIndex}-end`}>{paragraph.text.slice(cursor)}</span>,
              );
            }

            const translation = paragraph.tokens
              .filter((t) => t.word)
              .map((t) => t.word?.translation)
              .filter(Boolean)
              .join('; ');

            return (
              <div key={pIndex} className="reading-paragraph-block">
                <p className="reading-paragraph">{rendered}</p>
                {showTranslation && translation && (
                  <p className="reading-paragraph-translation">{translation}</p>
                )}
              </div>
            );
          })}
        </div>

        {showDictionary && (
          <div className="reading-dictionary">
            <div className="reading-dictionary-head">Незнакомые слова</div>
            {unknownWords.length === 0 ? (
              <div className="reading-dictionary-empty">Все слова известны</div>
            ) : (
              <div className="reading-dictionary-list">
                {unknownWords.map((token) => {
                  const word = token.word;
                  if (!word) return null;
                  return (
                    <div key={word.id ?? token.position} className="reading-dictionary-item">
                      <div className="reading-dictionary-word">
                        <span className="reading-dictionary-char">{word.character}</span>
                        <span className="reading-dictionary-pinyin">
                          <PinyinDisplay pinyin={word.pinyin} />
                        </span>
                        <span className="reading-dictionary-translation">
                          {word.translation}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`reading-dictionary-star${token.isPriority ? ' reading-dictionary-star-active' : ''}`}
                        onClick={() => handleAddPriority(word.id ?? '')}
                        aria-label="Добавить в приоритет"
                      >
                        <Star size={14} fill={token.isPriority ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {activeToken?.word && (
        <div
          className="reading-tooltip-portal"
          style={{
            position: 'fixed',
            left: tooltipPos.x,
            top: tooltipPos.y,
            zIndex: 100,
          }}
        >
          <WordTooltip
            word={activeToken.word}
            state={activeToken.state}
            isPriority={activeToken.isPriority}
            onAddPriority={() => handleAddPriority(activeToken.word?.id ?? '')}
            onSpeak={() => handleSpeak(activeToken.word?.character ?? '')}
          />
        </div>
      )}
    </div>
  );
}
