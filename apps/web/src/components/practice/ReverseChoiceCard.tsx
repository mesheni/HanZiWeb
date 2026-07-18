import { useEffect, useMemo, useState } from 'react';
import { Check, X, Volume2 } from 'lucide-react';
import type { Word } from '@hanzi/shared';
import { buildReverseChoiceOptions } from '../../utils/distractors';
import { cn } from '../../utils/cn';

interface ReverseChoiceCardProps {
  word: Word;
  pool: Word[];
  onAnswer: (correct: boolean) => void;
  /** Ручное озвучивание текущего слова (TTS). */
  onPlayAudio?: () => void;
  /** Доступно ли аудио (опционально — для дизейбла кнопки). */
  audioAvailable?: boolean;
}

/**
 * Reverse-choice: показываем русский перевод, пользователь выбирает
 * правильный иероглиф из 4 вариантов.
 */
export default function ReverseChoiceCard({
  word,
  pool,
  onAnswer,
  onPlayAudio,
  audioAvailable,
}: ReverseChoiceCardProps) {
  const options = useMemo(() => buildReverseChoiceOptions(word, pool, 4), [word, pool]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, 'idle' | 'correct' | 'wrong' | 'revealed'>>({});

  useEffect(() => {
    setSelectedId(null);
    setStates({});
  }, [word.id]);

  const choose = (option: Word) => {
    if (selectedId) return;
    const isCorrect = option.id === word.id;
    setSelectedId(option.id);
    setStates({
      [option.id]: isCorrect ? 'correct' : 'wrong',
      // 'revealed' — правильный ответ, который пользователь не выбрал
      // (подсвечиваем рамкой, без зелёной заливки). Аналог фикса
      // PLAN_Features_v0.4 §19 follow-up в MultipleChoiceCard.
      [word.id]: isCorrect ? 'correct' : 'revealed',
    });
    onAnswer(isCorrect);
  };

  return (
    <div className="practice-card">
      <div className="practice-card-question">
        <div className="practice-card-cue-row">
          <div className="practice-card-cue">Выбери иероглиф</div>
          {onPlayAudio && (
            <button
              type="button"
              className="practice-card-tts"
              onClick={onPlayAudio}
              disabled={audioAvailable === false}
              aria-label="Прослушать слово"
              title="Прослушать слово"
            >
              <Volume2 size={15} />
            </button>
          )}
        </div>
        <div className="practice-card-translation">{word.translation}</div>
      </div>

      <div className="practice-card-options practice-card-options--chars">
        {options.map((option) => {
          const state = states[option.id] ?? 'idle';
          return (
            <button
              key={option.id}
              type="button"
              className={cn(
                'practice-option practice-option--char',
                state === 'correct' && 'practice-option-correct',
                state === 'wrong' && 'practice-option-wrong',
                state === 'revealed' && 'practice-option-revealed',
              )}
              onClick={() => choose(option)}
              disabled={!!selectedId}
            >
              <span className="practice-option-character">{option.character}</span>
              {state === 'correct' && <Check size={14} className="practice-option-icon" />}
              {state === 'wrong' && <X size={14} className="practice-option-icon" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
