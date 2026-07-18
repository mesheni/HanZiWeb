import { useEffect, useRef, useState } from 'react';
import type { TransitionEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Volume2, PenLine } from 'lucide-react';
import { PinyinDisplay } from '../utils/toneColors';
import { cn } from '../utils/cn';
import { useStudyStore } from '../stores/studyStore';
import type { Word } from '@hanzi/shared';

type Direction = 'enter-right' | 'exit-left' | 'idle';

interface FlashcardProps {
  word: Word;
  isFlipped: boolean;
  onFlip: () => void;
  /** Срабатывает при клике на кнопку повторного воспроизведения аудио */
  onReplayAudio?: () => void;
  /** Загружается ли аудио (для индикатора) */
  audioLoading?: boolean;
  /** Доступно ли аудио вообще */
  hasAudio?: boolean;
}

/** Длительность CSS-перехода rotateY на .flashcard-flipper (см. global.css). */
const FLIP_DURATION_MS = 400;

/**
 * Карточка с 3D-переворотом.
 *
 * Лицевая сторона: иероглиф крупным шрифтом.
 * Оборотная: пиньинь с тонами, перевод, кнопка воспроизведения аудио.
 *
 * При смене `word.id` проигрывает микро-анимацию: уходящая карточка
 * уезжает влево, новая приезжает справа.
 *
 * PLAN_Features_v0.3 #12: пока идёт анимация переворота (`isFlipping`),
 * обратная сторона показывает СОДЕРЖИМОЕ ПРЕДЫДУЩЕГО СЛОВА (`displayedWord`).
 * Синхронизация с `word` происходит только после `transitionend` —
 * иначе при быстром нажатии «Следующее» можно подсмотреть перевод
 * следующего слова, пока карточка ещё не доехала до лицевой стороны.
 */
export default function Flashcard({
  word,
  isFlipped,
  onFlip,
  onReplayAudio,
  audioLoading,
  hasAudio,
}: FlashcardProps) {
  const navigate = useNavigate();
  const [direction, setDirection] = useState<Direction>('idle');
  const [displayedWord, setDisplayedWord] = useState(word);
  const prevWordIdRef = useRef<string | null>(word.id);
  const flipperRef = useRef<HTMLDivElement>(null);
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFlipping = useStudyStore((s) => s.isFlipping);
  const setIsFlipping = useStudyStore((s) => s.setIsFlipping);

  // Микро-анимация при смене карточки
  useEffect(() => {
    if (prevWordIdRef.current !== word.id) {
      setDirection('enter-right');
      const t = setTimeout(() => setDirection('idle'), 320);
      prevWordIdRef.current = word.id;
      return () => clearTimeout(t);
    }
    return undefined;
  }, [word.id]);

  // Синхронизируем displayedWord с word, когда анимация переворота не идёт.
  // Во время переворота обратная сторона «заморожена» на старом слове —
  // это и есть фикс бага #12.
  useEffect(() => {
    if (!isFlipping && displayedWord.id !== word.id) {
      setDisplayedWord(word);
    }
  }, [word, isFlipping, displayedWord.id]);

  // Сброс таймера при размонтировании
  useEffect(() => {
    return () => {
      if (flipTimeoutRef.current) {
        clearTimeout(flipTimeoutRef.current);
      }
    };
  }, []);

  const finishFlip = () => {
    if (flipTimeoutRef.current) {
      clearTimeout(flipTimeoutRef.current);
      flipTimeoutRef.current = null;
    }
    setIsFlipping(false);
  };

  const handleFlip = () => {
    if (isFlipping) return;
    onFlip();
    // Fallback на случай, если onTransitionEnd не выстрелит
    // (например, при смене карточки прямо в середине анимации).
    flipTimeoutRef.current = setTimeout(finishFlip, FLIP_DURATION_MS + 50);
  };

  const handleTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== flipperRef.current) return;
    if (e.propertyName !== 'transform') return;
    finishFlip();
  };

  return (
    <div
      className={cn(
        'flashcard-scene',
        `flashcard-${direction}`,
        isFlipping && 'flashcard-animating',
      )}
      onClick={handleFlip}
      role="button"
      tabIndex={0}
      aria-label={isFlipped ? 'Скрыть ответ' : 'Показать ответ'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleFlip();
        }
      }}
    >
      <div
        ref={flipperRef}
        className={cn('flashcard-flipper', isFlipped && 'flashcard-flipped')}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Front */}
        <div className="flashcard-face flashcard-front">
          <div className="flashcard-char">{word.character}</div>
          <div className="flashcard-hint">нажмите, чтобы открыть</div>
        </div>

        {/* Back — содержимое обновляется ТОЛЬКО после завершения анимации (см. displayedWord). */}
        <div className="flashcard-face flashcard-back">
          <div className="flashcard-back-char">{displayedWord.character}</div>
          <PinyinDisplay pinyin={displayedWord.pinyin} className="flashcard-pinyin" />
          <div className="flashcard-translation">{displayedWord.translation}</div>

          {displayedWord.examples && displayedWord.examples.length > 0 && (
            <div className="flashcard-example">
              <div className="flashcard-ex-zh">{displayedWord.examples[0]!.chinese}</div>
              <div className="flashcard-ex-ru">{displayedWord.examples[0]!.russian}</div>
            </div>
          )}

          {/* Кнопка воспроизведения аудио */}
          {hasAudio && (
            <button
              className="flashcard-audio-btn"
              onClick={(e) => {
                e.stopPropagation();
                onReplayAudio?.();
              }}
              aria-label="Воспроизвести аудио"
              disabled={audioLoading}
            >
              {audioLoading ? <span className="spinner" /> : <Volume2 size={16} />}
            </button>
          )}
          {!hasAudio && word.audioUrl === null && (
            <div className="flashcard-audio-missing" title="Аудио недоступно">
              <Volume2 size={14} />
            </div>
          )}

          {/* Кнопка "Потренировать написание".
              Используем displayedWord (замороженное на back-face), а не word —
              иначе во время flip-анимации пользователь увидит перевод старого
              слова, а URL поведёт на иероглиф нового. См. PLAN_Features_v0.4 §15. */}
          <button
            className="flashcard-practice-btn"
            onClick={(e) => {
              e.stopPropagation();
              const path = `/handwriting?char=${encodeURIComponent(displayedWord.character)}&pinyin=${encodeURIComponent(displayedWord.pinyin)}&translation=${encodeURIComponent(displayedWord.translation)}`;
              navigate(path);
            }}
            aria-label="Потренировать написание"
            title="Потренировать написание"
          >
            <PenLine size={14} />
            <span>Писать</span>
          </button>
        </div>
      </div>
    </div>
  );
}
