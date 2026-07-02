import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Volume2, PenLine } from 'lucide-react';
import { PinyinDisplay } from '../utils/toneColors';
import { cn } from '../utils/cn';
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

/**
 * Карточка с 3D-переворотом.
 *
 * Лицевая сторона: иероглиф крупным шрифтом.
 * Оборотная: пиньинь с тонами, перевод, кнопка воспроизведения аудио.
 *
 * При смене `word.id` проигрывает микро-анимацию: уходящая карточка
 * уезжает влево, новая приезжает справа.
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
  const prevWordIdRef = useRef<string | null>(word.id);

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

  return (
    <div
      className={cn('flashcard-scene', `flashcard-${direction}`)}
      onClick={onFlip}
      role="button"
      tabIndex={0}
      aria-label={isFlipped ? 'Скрыть ответ' : 'Показать ответ'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFlip();
        }
      }}
    >
      <div className={cn('flashcard-flipper', isFlipped && 'flashcard-flipped')}>
        {/* Front */}
        <div className="flashcard-face flashcard-front">
          <div className="flashcard-char">{word.character}</div>
          <div className="flashcard-hint">нажмите, чтобы открыть</div>
        </div>

        {/* Back */}
        <div className="flashcard-face flashcard-back">
          <div className="flashcard-back-char">{word.character}</div>
          <PinyinDisplay pinyin={word.pinyin} className="flashcard-pinyin" />
          <div className="flashcard-translation">{word.translation}</div>

          {word.examples && word.examples.length > 0 && (
            <div className="flashcard-example">
              <div className="flashcard-ex-zh">{word.examples[0]!.chinese}</div>
              <div className="flashcard-ex-ru">{word.examples[0]!.russian}</div>
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

          {/* Кнопка "Потренировать написание" */}
          <button
            className="flashcard-practice-btn"
            onClick={(e) => {
              e.stopPropagation();
              const path = `/handwriting?char=${encodeURIComponent(word.character)}&pinyin=${encodeURIComponent(word.pinyin)}&translation=${encodeURIComponent(word.translation)}`;
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
