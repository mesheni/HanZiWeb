import { useEffect, useMemo, useState } from 'react';
import { Check, X, Volume2 } from 'lucide-react';
import type { Word } from '@hanzi/shared';
import { buildMultipleChoiceOptions } from '../../utils/distractors';
import { cn } from '../../utils/cn';

interface MultipleChoiceCardProps {
  word: Word;
  pool: Word[];
  onAnswer: (correct: boolean) => void;
  /** Ручное озвучивание текущего слова (TTS). */
  onPlayAudio?: () => void;
  /** Доступно ли аудио (опционально — для дизейбла кнопки). */
  audioAvailable?: boolean;
}

type OptionState = 'idle' | 'selected' | 'correct' | 'wrong';

/**
 * Карточка multiple-choice: показываем иероглиф, пользователь выбирает
 * один из 4 вариантов перевода.
 */
export default function MultipleChoiceCard({
  word,
  pool,
  onAnswer,
  onPlayAudio,
  audioAvailable,
}: MultipleChoiceCardProps) {
  const options = useMemo(() => buildMultipleChoiceOptions(word, pool, 4), [word, pool]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, OptionState>>({});

  // Сбрасываем стейт при смене слова.
  useEffect(() => {
    setSelectedId(null);
    setStates({});
  }, [word.id]);

  const choose = (option: Word) => {
    if (selectedId) return; // уже ответили — нельзя перевыбирать
    const isCorrect = option.id === word.id;
    setSelectedId(option.id);
    setStates({
      [option.id]: isCorrect ? 'correct' : 'wrong',
      // Правильный ответ всегда подсвечивается зелёным — независимо от того,
      // выбрал его пользователь или нет. Раньше тут был копи-паста-тернарник
      // `isCorrect ? 'correct' : 'correct'` (PLAN_Features_v0.4 §19).
      [word.id]: 'correct',
    });
    // Вызываем onAnswer сразу — StudyScreen покажет feedback и
    // дождётся нажатия "Продолжить" прежде чем rateCard.
    onAnswer(isCorrect);
  };

  return (
    <div className="practice-card">
      <div className="practice-card-question">
        <div className="practice-card-cue-row">
          <div className="practice-card-cue">Выбери перевод</div>
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
        <div className="practice-card-character">{word.character}</div>
      </div>

      <div className="practice-card-options">
        {options.map((option) => {
          const state = states[option.id] ?? 'idle';
          return (
            <button
              key={option.id}
              type="button"
              className={cn(
                'practice-option',
                state === 'correct' && 'practice-option-correct',
                state === 'wrong' && 'practice-option-wrong',
                state === 'idle' && selectedId && option.id === word.id && 'practice-option-revealed',
              )}
              onClick={() => choose(option)}
              disabled={!!selectedId}
            >
              <span className="practice-option-label">{option.translation}</span>
              {state === 'correct' && <Check size={16} />}
              {state === 'wrong' && <X size={16} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
