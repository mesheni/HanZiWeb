import { useEffect, useRef, useState } from 'react';
import { Check, X, Volume2 } from 'lucide-react';
import type { Word } from '@hanzi/shared';
import { pinyinSyllableMatches } from '../../utils/pinyinNormalize';
import { cn } from '../../utils/cn';

interface PinyinInputCardProps {
  word: Word;
  onAnswer: (correct: boolean) => void;
  /** Ручное озвучивание текущего слова (TTS). */
  onPlayAudio?: () => void;
  /** Доступно ли аудио (опционально — для дизейбла кнопки). */
  audioAvailable?: boolean;
}

/**
 * Ввод пиньиня: показываем иероглиф, пользователь набирает пиньинь
 * (включая тоны через цифры 1-4 или диакритику).
 *
 * Проверяем послогово: при ошибке в слоге подсвечиваем его красным.
 */
export default function PinyinInputCard({
  word,
  onAnswer,
  onPlayAudio,
  audioAvailable,
}: PinyinInputCardProps) {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [matches, setMatches] = useState<boolean[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setInput('');
    setSubmitted(false);
    setMatches([]);
    // Автофокус при смене слова.
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [word.id]);

  const submit = () => {
    if (submitted || !input.trim()) return;
    const m = pinyinSyllableMatches(input, word.pinyin);
    setMatches(m);
    setSubmitted(true);
    const allOk = m.every(Boolean);
    window.setTimeout(() => onAnswer(allOk), 700);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="practice-card">
      <div className="practice-card-question">
        <div className="practice-card-cue-row">
          <div className="practice-card-cue">Набери пиньинь</div>
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

      <div className="practice-input-wrap">
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={cn(
            'practice-input',
            submitted && (matches.every(Boolean) ? 'practice-input-correct' : 'practice-input-wrong'),
          )}
          placeholder="например, xǐ huān или xi3 huan1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={submitted}
        />
        <button
          type="button"
          className="practice-submit"
          onClick={submit}
          disabled={submitted || !input.trim()}
        >
          Проверить
        </button>
      </div>

      {submitted && (
        <div className={cn('practice-feedback', matches.every(Boolean) ? 'practice-feedback-ok' : 'practice-feedback-bad')}>
          {matches.every(Boolean) ? (
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
