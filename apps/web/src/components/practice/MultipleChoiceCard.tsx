import { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Word } from '@hanzi/shared';
import { buildMultipleChoiceOptions } from '../../utils/distractors';
import { cn } from '../../utils/cn';

interface MultipleChoiceCardProps {
  word: Word;
  pool: Word[];
  onAnswer: (correct: boolean) => void;
}

type OptionState = 'idle' | 'selected' | 'correct' | 'wrong';

/**
 * Карточка multiple-choice: показываем иероглиф, пользователь выбирает
 * один из 4 вариантов перевода.
 */
export default function MultipleChoiceCard({ word, pool, onAnswer }: MultipleChoiceCardProps) {
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
      [word.id]: isCorrect ? 'correct' : 'correct',
    });
    // Небольшая задержка чтобы пользователь увидел подсветку.
    window.setTimeout(() => onAnswer(isCorrect), 480);
  };

  return (
    <div className="practice-card">
      <div className="practice-card-question">
        <div className="practice-card-cue">Выбери перевод</div>
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
