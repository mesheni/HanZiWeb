import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, Volume2 } from 'lucide-react';
import type { Word } from '@hanzi/shared';
import { useAudio } from '../../hooks/useAudio';
import { parsePinyin, TONE_COLORS } from '../../utils/toneColors';
import { cn } from '../../utils/cn';

interface ToneRecognitionCardProps {
  word: Word;
  onAnswer: (correct: boolean) => void;
}

type Tone = 1 | 2 | 3 | 4;
const TONE_OPTIONS: Tone[] = [1, 2, 3, 4];

/**
 * Распознавание тона: воспроизводим аудио слова, пользователь выбирает тон.
 * Тон определяется по первому слогу пиньиня (если несколько — берём
 * первый ненулевой тон).
 */
function detectTargetTone(pinyin: string): Tone {
  const syllables = parsePinyin(pinyin);
  for (const s of syllables) {
    if (s.tone >= 1 && s.tone <= 4) return s.tone as Tone;
  }
  // Fallback: 1-й тон.
  return 1;
}

export default function ToneRecognitionCard({ word, onAnswer }: ToneRecognitionCardProps) {
  const targetTone = useMemo(() => detectTargetTone(word.pinyin), [word.pinyin]);
  const audio = useAudio(word.id);
  const [selected, setSelected] = useState<Tone | null>(null);
  const playedRef = useRef(false);

  useEffect(() => {
    setSelected(null);
    playedRef.current = false;
  }, [word.id]);

  // Автоплей при появлении карточки (если аудио доступно).
  useEffect(() => {
    if (!playedRef.current && audio.isAvailable && word.id) {
      playedRef.current = true;
      const t = window.setTimeout(() => audio.play(), 220);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [audio.isAvailable, audio.play, word.id]);

  const choose = (tone: Tone) => {
    if (selected !== null) return;
    setSelected(tone);
    const isCorrect = tone === targetTone;
    window.setTimeout(() => onAnswer(isCorrect), 600);
  };

  return (
    <div className="practice-card">
      <div className="practice-card-question">
        <div className="practice-card-cue">Какой тон?</div>
        <button
          type="button"
          className="practice-tone-audio"
          onClick={() => audio.play()}
          disabled={!audio.isAvailable}
          aria-label="Воспроизвести аудио"
        >
          {audio.isAvailable ? <Volume2 size={28} /> : <span className="spinner" />}
        </button>
        <div className="practice-card-hint">
          {audio.isAvailable ? 'Послушайте и выберите тон' : 'Аудио недоступно — выбор наугад'}
        </div>
      </div>

      <div className="practice-tone-row">
        {TONE_OPTIONS.map((tone) => {
          const state =
            selected === null
              ? 'idle'
              : tone === targetTone
                ? 'correct'
                : tone === selected
                  ? 'wrong'
                  : 'idle';
          return (
            <button
              key={tone}
              type="button"
              className={cn(
                'practice-tone',
                `practice-tone-${tone}`,
                state === 'correct' && 'practice-option-correct',
                state === 'wrong' && 'practice-option-wrong',
              )}
              onClick={() => choose(tone)}
              disabled={selected !== null}
              style={{
                borderColor: state === 'idle' ? `${TONE_COLORS[tone]}55` : undefined,
              }}
            >
              <span className="practice-tone-number" style={{ color: TONE_COLORS[tone] }}>
                {tone}
              </span>
              <span className="practice-tone-mark" style={{ color: TONE_COLORS[tone] }}>
                {(['ā', 'á', 'ǎ', 'à'] as const)[tone - 1]}
              </span>
              {state === 'correct' && <Check size={14} style={{ color: TONE_COLORS[tone] }} />}
              {state === 'wrong' && <X size={14} style={{ color: TONE_COLORS[tone] }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
