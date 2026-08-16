import { useEffect, useMemo, useState } from 'react';
import { Check, X, Volume2 } from 'lucide-react';
import type { Word } from '@hanzi/shared';
import { buildMultipleChoiceOptions } from '@hanzi/shared';
import { cn } from '../../utils/cn';
import { useOptionHotkeys } from '../../hooks/useOptionHotkeys';

interface ListeningCardProps {
  word: Word;
  pool: Word[];
  onAnswer: (correct: boolean) => void;
  /** Ручное озвучивание текущего слова (TTS). */
  onPlayAudio?: () => void;
  /** Доступно ли аудио (опционально — для дизейбла кнопки). */
  audioAvailable?: boolean;
}

type OptionState = 'idle' | 'correct' | 'wrong' | 'revealed';

/**
 * Карточка аудирования: звучит слово (TTS), пользователь выбирает
 * перевод из 4 вариантов. Иероглиф и пиньинь скрыты до ответа — их
 * показывает feedback-панель StudyScreen после выбора.
 */
export default function ListeningCard({
  word,
  pool,
  onAnswer,
  onPlayAudio,
  audioAvailable,
}: ListeningCardProps) {
  const options = useMemo(() => buildMultipleChoiceOptions(word, pool, 4), [word, pool]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, OptionState>>({});

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
      [word.id]: isCorrect ? 'correct' : 'revealed',
    });
    onAnswer(isCorrect);
  };

  useOptionHotkeys(options.length, (index) => choose(options[index]!), selectedId === null);

  const play = onPlayAudio ?? (() => {});

  return (
    <div className="practice-card">
      <div className="practice-card-question">
        <div className="practice-card-cue">Что ты слышишь?</div>
        <button
          type="button"
          className="practice-tone-audio"
          onClick={play}
          disabled={audioAvailable === false}
          aria-label="Воспроизвести аудио"
        >
          <Volume2 size={28} />
        </button>
        <div className="practice-card-hint">
          {audioAvailable === false
            ? 'Аудио недоступно — включите авто-озвучку или выберите наугад'
            : 'Нажмите, чтобы прослушать ещё раз'}
        </div>
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
                state === 'revealed' && 'practice-option-revealed',
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
