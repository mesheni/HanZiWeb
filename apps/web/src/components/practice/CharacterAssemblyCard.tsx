import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, Volume2 } from 'lucide-react';
import type { Word } from '@hanzi/shared';
import { cn } from '../../utils/cn';

interface CharacterAssemblyCardProps {
  word: Word;
  distractors: string[];
  onAnswer: (correct: boolean) => void;
  /** Ручное озвучивание текущего слова (TTS). */
  onPlayAudio?: () => void;
  /** Доступно ли аудио (опционально — для дизейбла кнопки). */
  audioAvailable?: boolean;
}

/**
 * Конструктор слова из иероглифов: пользователь собирает иероглифы
 * целевого слова в правильном порядке, опираясь на перевод и аудио.
 * Поддерживается как клик, так и drag-and-drop.
 */
export default function CharacterAssemblyCard({
  word,
  distractors,
  onAnswer,
  onPlayAudio,
  audioAvailable,
}: CharacterAssemblyCardProps) {
  const correctCharacters = useMemo(() => Array.from(word.character), [word.character]);

  const [pool, setPool] = useState<string[]>([]);
  const [answer, setAnswer] = useState<(string | null)[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [dragOver, setDragOver] = useState<'answer' | 'pool' | null>(null);

  // Ref отслеживает, для какого слова уже собран пул. Родитель может
  // передавать новую ссылку `distractors` при несвязанных re-render'ах
  // (например, при обновлении `isPlaying`/`isAvailable` в `useAudio` после
  // нажатия кнопки озвучки, либо при финишировании загрузки через
  // `useDistractorPool`), и без этой защиты useEffect перезапускал бы
  // shuffle и сбрасывал `answer` прямо во время сборки пользователем —
  // баг «CharacterAssembly в тренировке» (PLAN_Features_v0.4 §12).
  const lastBuiltKeyRef = useRef<string>('');

  useEffect(() => {
    const key = `${word.id}::${word.character}::${distractors.join(',')}`;
    if (lastBuiltKeyRef.current === key) return;
    lastBuiltKeyRef.current = key;
    const chars = [...correctCharacters, ...distractors];
    // Перемешиваем Fisher–Yates.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = chars[i]!;
      chars[i] = chars[j]!;
      chars[j] = tmp;
    }
    setPool(chars);
    setAnswer(Array.from({ length: correctCharacters.length }, () => null));
    setSubmitted(false);
  }, [word.id, word.character, distractors, correctCharacters.length]);

  const moveToAnswer = (char: string, poolIndex: number) => {
    if (submitted) return;
    const slotIndex = answer.findIndex((s) => s === null);
    if (slotIndex === -1) return;
    setAnswer((a) => {
      const next = [...a];
      next[slotIndex] = char;
      return next;
    });
    setPool((p) => p.filter((_, i) => i !== poolIndex));
  };

  const moveToPool = (slotIndex: number) => {
    if (submitted) return;
    const char = answer[slotIndex];
    if (!char) return;
    setAnswer((a) => {
      const next = [...a];
      next[slotIndex] = null;
      return next;
    });
    setPool((p) => [...p, char]);
  };

  const submit = () => {
    if (submitted) return;
    const userAnswer = answer.every((s) => s !== null) ? answer.join('') : '';
    const correct = userAnswer === word.character;
    setSubmitted(true);
    window.setTimeout(() => onAnswer(correct), 700);
  };

  const isFilled = answer.every((s) => s !== null);
  const isCorrect = submitted && answer.join('') === word.character;

  return (
    <div className="practice-card">
      <div className="practice-card-question">
        <div className="practice-card-cue-row">
          <div className="practice-card-cue">Собери слово</div>
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
        <div className="practice-card-hint" style={{ fontSize: 18, marginTop: 4 }}>
          {word.translation}
        </div>
      </div>

      <div
        className={cn(
          'practice-answer',
          dragOver === 'answer' && 'practice-drop-target',
          submitted && (isCorrect ? 'practice-answer-ok' : 'practice-answer-bad'),
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver('answer');
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(null);
          const data = e.dataTransfer.getData('text/plain');
          if (!data.startsWith('pool:')) return;
          const idx = Number(data.slice(5));
          if (Number.isFinite(idx) && pool[idx]) {
            moveToAnswer(pool[idx]!, idx);
          }
        }}
      >
        {answer.map((char, i) =>
          char ? (
            <button
              key={`slot-${i}`}
              type="button"
              className="syllable-chip"
              draggable={!submitted}
              onClick={() => moveToPool(i)}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', `slot:${i}`);
              }}
              disabled={submitted}
              aria-label={`Слот ${i + 1}: ${char}`}
            >
              {char}
            </button>
          ) : (
            <span key={`slot-${i}`} className="character-slot" aria-label={`Слот ${i + 1} пуст`} />
          ),
        )}
      </div>

      <div
        className={cn('practice-pool', dragOver === 'pool' && 'practice-drop-target')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver('pool');
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(null);
          const data = e.dataTransfer.getData('text/plain');
          if (!data.startsWith('slot:')) return;
          const idx = Number(data.slice(5));
          if (Number.isFinite(idx) && answer[idx]) {
            moveToPool(idx);
          }
        }}
      >
        {pool.map((char, i) => (
          <button
            key={`pool-${i}-${char}`}
            type="button"
            className="syllable-chip syllable-chip-pool"
            draggable={!submitted}
            onClick={() => moveToAnswer(char, i)}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', `pool:${i}`);
            }}
            disabled={submitted}
            aria-label={`Иероглиф ${char}`}
          >
            {char}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="practice-submit"
        onClick={submit}
        disabled={submitted || !isFilled}
      >
        Проверить
      </button>

      {submitted && (
        <div
          className={cn(
            'practice-feedback',
            isCorrect ? 'practice-feedback-ok' : 'practice-feedback-bad',
          )}
        >
          {isCorrect ? (
            <>
              <Check size={14} /> Верно: {word.character}
            </>
          ) : (
            <>
              <X size={14} /> Правильно: {word.character}
            </>
          )}
        </div>
      )}
    </div>
  );
}
