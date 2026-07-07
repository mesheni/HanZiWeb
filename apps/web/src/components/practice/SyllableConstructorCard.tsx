import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, Volume2 } from 'lucide-react';
import type { Word } from '@hanzi/shared';
import { buildSyllablePool } from '../../utils/distractors';
import { cn } from '../../utils/cn';

interface SyllableConstructorCardProps {
  word: Word;
  poolPinyin: string[];
  onAnswer: (correct: boolean) => void;
  /** Ручное озвучивание текущего слова (TTS). */
  onPlayAudio?: () => void;
  /** Доступно ли аудио (опционально — для дизейбла кнопки). */
  audioAvailable?: boolean;
}

/**
 * Конструктор пиньиня: пользователь перетаскивает слоги в правильном
 * порядке (или кликает, чтобы переместить). Поддерживается и
 * drag-and-drop, и click-to-move (на мобильных и без drag).
 */
export default function SyllableConstructorCard({
  word,
  poolPinyin,
  onAnswer,
  onPlayAudio,
  audioAvailable,
}: SyllableConstructorCardProps) {
  const correctSyllables = useMemo(
    () => word.pinyin.split(/\s+/).filter(Boolean),
    [word.pinyin],
  );

  const [pool, setPool] = useState<string[]>([]);
  const [answer, setAnswer] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [dragOver, setDragOver] = useState<'pool' | 'answer' | null>(null);

  // Ref отслеживает, для какого слова уже собран пул. Родитель может
  // передавать новую ссылку `poolPinyin` при несвязанных re-render'ах
  // (например, при обновлении `isPlaying`/`isAvailable` в `useAudio` после
  // нажатия кнопки озвучки), и без этой защиты useEffect перезапускал бы
  // `buildSyllablePool` и заново перемешивал слоги прямо во время сборки
  // пользователем — баг «Собери пиньинь» (PLAN_Features_v0.3 §14).
  const lastBuiltKeyRef = useRef<string>('');

  // Инициализация пула слогов при смене слова.
  useEffect(() => {
    const key = `${word.id}::${word.pinyin}`;
    if (lastBuiltKeyRef.current === key) return;
    lastBuiltKeyRef.current = key;
    setPool(buildSyllablePool(word.pinyin, poolPinyin, 3));
    setAnswer([]);
    setSubmitted(false);
  }, [word.id, word.pinyin, poolPinyin]);

  const moveToAnswer = (syllable: string, index: number) => {
    if (submitted) return;
    setAnswer((a) => [...a, syllable]);
    setPool((p) => p.filter((_, i) => i !== index));
  };

  const moveToPool = (syllable: string, index: number) => {
    if (submitted) return;
    setPool((p) => [...p, syllable]);
    setAnswer((a) => a.filter((_, i) => i !== index));
  };

  const submit = () => {
    if (submitted || answer.length === 0) return;
    const userAnswer = answer.join(' ');
    const correct = answer.length === correctSyllables.length &&
      answer.every((s, i) => normalize(s) === normalize(correctSyllables[i]!));
    setSubmitted(true);
    window.setTimeout(() => onAnswer(correct), 700);
    void userAnswer;
  };

  const isCorrect = submitted &&
    answer.length === correctSyllables.length &&
    answer.every((s, i) => normalize(s) === normalize(correctSyllables[i]!));

  return (
    <div className="practice-card">
      <div className="practice-card-question">
        <div className="practice-card-cue-row">
          <div className="practice-card-cue">Собери пиньинь</div>
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
        <div className="practice-card-hint">{word.translation}</div>
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
        {answer.length === 0 ? (
          <span className="practice-answer-placeholder">Перетащи слоги сюда</span>
        ) : (
          answer.map((s, i) => (
            <button
              key={`a-${i}-${s}`}
              type="button"
              className="syllable-chip"
              draggable={!submitted}
              onClick={() => moveToPool(s, i)}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', `answer:${i}`);
              }}
            >
              {s}
            </button>
          ))
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
          if (!data.startsWith('answer:')) return;
          const idx = Number(data.slice(8));
          if (Number.isFinite(idx) && answer[idx]) {
            moveToPool(answer[idx]!, idx);
          }
        }}
      >
        {pool.map((s, i) => (
          <button
            key={`p-${i}-${s}`}
            type="button"
            className="syllable-chip syllable-chip-pool"
            draggable={!submitted}
            onClick={() => moveToAnswer(s, i)}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', `pool:${i}`);
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="practice-submit"
        onClick={submit}
        disabled={submitted || answer.length === 0}
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
              <Check size={14} /> Верно: {word.pinyin}
            </>
          ) : (
            <>
              <X size={14} /> Правильно: {word.pinyin}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[1-4]/g, '');
}
