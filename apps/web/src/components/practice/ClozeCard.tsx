import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, Volume2 } from 'lucide-react';
import type { Word, Example, ClozeQuestion } from '@hanzi/shared';
import { apiPost } from '../../api/client';
import { useToastStore } from '../../stores/toastStore';
import { buildClozeQuestion, checkClozeAnswer, CLOZE_MARKER } from '../../utils/cloze';
import { cn } from '../../utils/cn';

interface ClozeCardProps {
  word: Word;
  examples: Example[];
  onAnswer: (correct: boolean) => void;
}

/**
 * Карточка cloze: показываем предложение с пропуском (____),
 * пользователь вводит иероглиф, который был скрыт. При неверном ответе
 * подсвечиваем правильный вариант + показываем русскую подсказку.
 *
 * Дополнительно: TTS для целого предложения (восстанавливаем из
 * `sentence` и проигрываем через Google TTS / кэш).
 */
export default function ClozeCard({ word, examples, onAnswer }: ClozeCardProps) {
  // Берём первый пример, из которого удалось вырезать пропуск.
  // Если таких нет — UI покажет заглушку «нет подходящих предложений».
  const question = useMemo<ClozeQuestion | null>(() => {
    for (const ex of examples) {
      const q = buildClozeQuestion(ex, word);
      if (q) return q;
    }
    return null;
  }, [examples, word.id, word.character, word.pinyin]);

  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  // Сброс на новое слово/вопрос.
  useEffect(() => {
    setInput('');
    setSubmitted(false);
    setCorrect(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [question?.exampleId, word.id]);

  const submit = async () => {
    if (submitted || !question || !input.trim()) return;
    const isCorrect = checkClozeAnswer(input, question.answer);
    setCorrect(isCorrect);
    setSubmitted(true);

    // Пишем попытку в БД (best-effort, не блокируем UI при ошибке).
    try {
      await apiPost('/cloze/attempts', { exampleId: question.exampleId, correct: isCorrect });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось сохранить попытку';
      addToast(msg, 'error');
    }

    window.setTimeout(() => onAnswer(isCorrect), 900);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  if (!question) {
    return (
      <div className="practice-card">
        <div className="practice-card-cue">Подстановка</div>
        <div className="practice-card-hint">
          Нет предложений-примеров, содержащих «{word.character}».
        </div>
        <button
          type="button"
          className="practice-submit"
          onClick={() => onAnswer(false)}
        >
          Пропустить
        </button>
      </div>
    );
  }

  return (
    <div className="practice-card">
      <div className="practice-card-question">
        <div className="practice-card-cue">Вставь пропущенное слово</div>
        <SentenceWithCloze
          sentence={question.clozeSentence}
          marker={CLOZE_MARKER}
          revealed={submitted ? question.answer : undefined}
        />
        <button
          type="button"
          className="practice-tone-audio practice-sentence-tts"
          onClick={() => speakSentence(question.sentence)}
          aria-label="Прослушать предложение"
          title="Прослушать предложение"
        >
          <Volume2 size={20} />
        </button>
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
            submitted && (correct ? 'practice-input-correct' : 'practice-input-wrong'),
          )}
          placeholder="введите иероглиф или пиньинь…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={submitted}
        />
        <button
          type="button"
          className="practice-submit"
          onClick={() => void submit()}
          disabled={submitted || !input.trim()}
        >
          Проверить
        </button>
      </div>

      {submitted && (
        <div
          className={cn(
            'practice-feedback',
            correct ? 'practice-feedback-ok' : 'practice-feedback-bad',
          )}
        >
          {correct ? (
            <>
              <Check size={14} /> Верно: {question.answer}
            </>
          ) : (
            <>
              <X size={14} /> Правильно: {question.answer} — {question.hint}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SentenceWithCloze({
  sentence,
  marker,
  revealed,
}: {
  sentence: string;
  marker: string;
  revealed?: string;
}) {
  const idx = sentence.indexOf(marker);
  if (idx === -1) {
    return <div className="cloze-sentence">{sentence}</div>;
  }
  const before = sentence.slice(0, idx);
  const after = sentence.slice(idx + marker.length);
  return (
    <div className="cloze-sentence">
      <span>{before}</span>
      <span className="cloze-blank">
        {revealed ?? marker}
      </span>
      <span>{after}</span>
    </div>
  );
}

/**
 * Воспроизведение аудио для всего предложения: пытаемся использовать
 * кэшированный / сгенерированный URL через /audio/generate. При ошибке
 * (например, нет Google-credentials) — переходим на браузерный TTS.
 */
function speakSentence(text: string): void {
  // Браузерный fallback (offline / без Google-ключа) — поддерживается
  // только для zh-CN/русского в Chromium/Firefox/Safari.
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
  } catch {
    // Тихо игнорируем — UI не должен падать.
  }
}
