import { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Word } from '@hanzi/shared';
import { buildReverseChoiceOptions } from '../../utils/distractors';
import { cn } from '../../utils/cn';

interface ReverseChoiceCardProps {
  word: Word;
  pool: Word[];
  onAnswer: (correct: boolean) => void;
}

/**
 * Reverse-choice: показываем русский перевод, пользователь выбирает
 * правильный иероглиф из 4 вариантов.
 */
export default function ReverseChoiceCard({ word, pool, onAnswer }: ReverseChoiceCardProps) {
  const options = useMemo(() => buildReverseChoiceOptions(word, pool, 4), [word, pool]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, 'idle' | 'correct' | 'wrong'>>({});

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
      [word.id]: 'correct',
    });
    window.setTimeout(() => onAnswer(isCorrect), 480);
  };

  return (
    <div className="practice-card">
      <div className="practice-card-question">
        <div className="practice-card-cue">Выбери иероглиф</div>
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
                state === 'idle' && selectedId && option.id === word.id && 'practice-option-revealed',
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
