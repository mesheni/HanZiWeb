import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import type { TestQuestion } from '@hanzi/shared';
import { useAudio } from '../../hooks/useAudio';
import { cn } from '../../utils/cn';
import { TONE_COLORS } from '../../utils/toneColors';

interface TestQuestionCardProps {
  question: TestQuestion;
  index: number;
  total: number;
  onAnswer: (answer: string) => void;
}

/**
 * Универсальная карточка вопроса теста (PLAN_Features_v0.3 §6).
 *
 * В отличие от `practice/*` карточек, обратной связи «правильно/неправильно»
 * нет — пользователь выбирает/вводит ответ, карточка зовёт `onAnswer(answer)`
 * и сразу переходит к следующему вопросу. Разбор ошибок — на финальном экране.
 *
 * Поддерживает 6 типов:
 *  - `multiple-choice-translation`
 *  - `reverse-choice-character`
 *  - `pinyin-input`
 *  - `tone-recognition`
 *  - `character-assembly`
 *  - `cloze`
 */
export default function TestQuestionCard({
  question,
  index,
  total,
  onAnswer,
}: TestQuestionCardProps) {
  return (
    <div className="test-question">
      <div className="test-question-header">
        <span className="test-question-counter">
          Вопрос {index + 1} / {total}
        </span>
        <span className="test-question-type">{typeLabel(question.type)}</span>
      </div>

      <div className="test-question-body">{renderBody(question, onAnswer)}</div>
    </div>
  );
}

function typeLabel(type: TestQuestion['type']): string {
  switch (type) {
    case 'multiple-choice-translation':
      return 'Выбор перевода';
    case 'reverse-choice-character':
      return 'Выбор иероглифа';
    case 'pinyin-input':
      return 'Набор пиньиня';
    case 'tone-recognition':
      return 'Тон на слух';
    case 'character-assembly':
      return 'Собери слово';
    case 'cloze':
      return 'Вставь слово';
  }
}

function renderBody(question: TestQuestion, onAnswer: (answer: string) => void): JSX.Element {
  switch (question.type) {
    case 'multiple-choice-translation':
      return <MultipleChoiceBody question={question} onAnswer={onAnswer} />;
    case 'reverse-choice-character':
      return <ReverseChoiceBody question={question} onAnswer={onAnswer} />;
    case 'pinyin-input':
      return <PinyinInputBody question={question} onAnswer={onAnswer} />;
    case 'tone-recognition':
      return <ToneRecognitionBody question={question} onAnswer={onAnswer} />;
    case 'character-assembly':
      return <CharacterAssemblyBody question={question} onAnswer={onAnswer} />;
    case 'cloze':
      return <ClozeBody question={question} onAnswer={onAnswer} />;
  }
}

/* ─── Multiple-choice (выбор перевода) ──────────────────────────────── */

function MultipleChoiceBody({
  question,
  onAnswer,
}: Pick<TestQuestionCardProps, 'question' | 'onAnswer'>) {
  return (
    <>
      <div className="test-question-cue">Выбери правильный перевод</div>
      <div className="test-question-character-wrap">
        <div className="test-question-pinyin">{question.wordPinyin}</div>
        <div className="test-question-translation">{question.wordTranslation}</div>
        <div
          className="test-question-character"
          title={`${question.wordPinyin} — ${question.wordTranslation}`}
        >
          {question.wordCharacter}
        </div>
      </div>
      <div className="test-question-options">
        {question.options.map((opt) => (
          <button
            key={opt}
            type="button"
            className="test-question-option"
            onClick={() => onAnswer(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </>
  );
}

/* ─── Reverse-choice (выбор иероглифа) ──────────────────────────────── */

function ReverseChoiceBody({
  question,
  onAnswer,
}: Pick<TestQuestionCardProps, 'question' | 'onAnswer'>) {
  return (
    <>
      <div className="test-question-cue">Выбери правильный иероглиф</div>
      <div className="test-question-character-wrap">
        <div className="test-question-pinyin">{question.wordPinyin}</div>
        <div
          className="test-question-character"
          title={`${question.wordPinyin} — ${question.wordTranslation}`}
        >
          {question.wordCharacter}
        </div>
        <div className="test-question-translation">{question.wordTranslation}</div>
      </div>
      <div className="test-question-options test-question-options--chars">
        {question.options.map((opt) => (
          <button
            key={opt}
            type="button"
            className="test-question-option test-question-option--char"
            onClick={() => onAnswer(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </>
  );
}

/* ─── Pinyin input ──────────────────────────────────────────────────── */

function PinyinInputBody({
  question,
  onAnswer,
}: Pick<TestQuestionCardProps, 'question' | 'onAnswer'>) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValue('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [question.id]);

  const submit = () => {
    if (!value.trim()) return;
    onAnswer(value);
  };

  return (
    <>
      <div className="test-question-cue">Набери пиньинь</div>
      <div className="test-question-character-wrap">
        <div className="test-question-pinyin">{question.wordPinyin}</div>
        <div
          className="test-question-character"
          title={`${question.wordPinyin} — ${question.wordTranslation}`}
        >
          {question.wordCharacter}
        </div>
        <div className="test-question-translation">{question.wordTranslation}</div>
      </div>
      <div className="practice-input-wrap">
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="practice-input"
          placeholder="xǐ huān или xi3 huan1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="practice-submit" onClick={submit} disabled={!value.trim()}>
          Дальше
        </button>
      </div>
    </>
  );
}

/* ─── Tone recognition ──────────────────────────────────────────────── */

function ToneRecognitionBody({
  question,
  onAnswer,
}: Pick<TestQuestionCardProps, 'question' | 'onAnswer'>) {
  const audio = useAudio(question.wordId);
  const [selected, setSelected] = useState<1 | 2 | 3 | 4 | null>(null);
  const playedRef = useRef(false);

  useEffect(() => {
    setSelected(null);
    playedRef.current = false;
  }, [question.id]);

  useEffect(() => {
    if (!playedRef.current && audio.isAvailable) {
      playedRef.current = true;
      const t = window.setTimeout(() => audio.play(), 220);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [audio.isAvailable, audio.play, question.id]);

  const choose = (tone: 1 | 2 | 3 | 4) => {
    if (selected !== null) return;
    setSelected(tone);
    window.setTimeout(() => onAnswer(String(tone)), 240);
  };

  return (
    <>
      <div className="test-question-cue">Какой тон?</div>
      <div className="test-question-character-wrap">
        <div className="test-question-pinyin">{question.wordPinyin}</div>
        <div
          className="test-question-character"
          title={`${question.wordPinyin} — ${question.wordTranslation}`}
        >
          {question.wordCharacter}
        </div>
      </div>
      <button
        type="button"
        className="practice-tone-audio"
        onClick={() => audio.play()}
        disabled={!audio.isAvailable}
        aria-label="Воспроизвести аудио"
      >
        <Volume2 size={28} />
      </button>
      <div className="test-question-tone-row">
        {[1, 2, 3, 4].map((tone) => {
          const isPicked = selected === tone;
          return (
            <button
              key={tone}
              type="button"
              className={cn('practice-tone', `practice-tone-${tone}`)}
              onClick={() => choose(tone as 1 | 2 | 3 | 4)}
              disabled={selected !== null}
              style={{
                borderColor: isPicked
                  ? TONE_COLORS[tone as 1 | 2 | 3 | 4]
                  : `${TONE_COLORS[tone as 1 | 2 | 3 | 4]}55`,
              }}
            >
              <span
                className="practice-tone-number"
                style={{ color: TONE_COLORS[tone as 1 | 2 | 3 | 4] }}
              >
                {tone}
              </span>
              <span
                className="practice-tone-mark"
                style={{ color: TONE_COLORS[tone as 1 | 2 | 3 | 4] }}
              >
                {(['ā', 'á', 'ǎ', 'à'] as const)[tone - 1]}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ─── Character assembly (иероглифы) ───────────────────────────────── */

function CharacterAssemblyBody({
  question,
  onAnswer,
}: Pick<TestQuestionCardProps, 'question' | 'onAnswer'>) {
  const [pool, setPool] = useState<string[]>([]);
  const [answer, setAnswer] = useState<string[]>([]);

  useEffect(() => {
    setPool(question.characterPool);
    setAnswer([]);
  }, [question.id, question.characterPool]);

  const totalSlots = question.correctAnswer.length;
  const finished = answer.length === totalSlots;

  const moveToAnswer = (ch: string, poolIdx: number) => {
    if (finished) return;
    setAnswer((a) => [...a, ch]);
    setPool((p) => p.filter((_, i) => i !== poolIdx));
  };

  const moveToPool = (ch: string, fromIndex: number) => {
    if (finished) return;
    setPool((p) => {
      const next = [...p];
      next.splice(fromIndex, 0, ch);
      return next;
    });
    setAnswer((a) => a.filter((_, i) => i !== fromIndex));
  };

  const submit = () => {
    if (!finished) return;
    onAnswer(answer.join(''));
  };

  return (
    <>
      <div className="test-question-cue">Собери иероглифы в правильном порядке</div>
      <div className="test-question-character-wrap">
        <div className="test-question-pinyin">{question.wordPinyin}</div>
        <div
          className="test-question-translation"
          title={`${question.wordPinyin} — ${question.wordTranslation}`}
        >
          {question.wordTranslation}
        </div>
      </div>

      <div className="test-question-slots">
        {Array.from({ length: totalSlots }).map((_, i) => {
          const ch = answer[i];
          return (
            <button
              key={`slot-${i}`}
              type="button"
              className={cn('test-question-slot', ch && 'test-question-slot-filled')}
              onClick={() => ch && moveToPool(ch, i)}
              aria-label={ch ? `Убрать ${ch}` : `Пустой слот ${i + 1}`}
            >
              {ch ?? '?'}
            </button>
          );
        })}
      </div>

      <div className="test-question-char-pool">
        {pool.map((ch, i) => (
          <button
            key={`p-${i}-${ch}`}
            type="button"
            className="test-question-char-chip"
            onClick={() => moveToAnswer(ch, i)}
          >
            {ch}
          </button>
        ))}
      </div>

      <button type="button" className="practice-submit" onClick={submit} disabled={!finished}>
        Дальше
      </button>
    </>
  );
}

/* ─── Cloze (вставка пропуска выбором) ──────────────────────────────── */

function ClozeBody({ question, onAnswer }: Pick<TestQuestionCardProps, 'question' | 'onAnswer'>) {
  const sentence = question.clozeSentence ?? '';
  const parts = sentence.split('____');

  return (
    <>
      <div className="test-question-cue">Вставь пропущенное слово</div>
      <div className="test-question-character-wrap">
        <div className="test-question-pinyin">{question.wordPinyin}</div>
        <div
          className="test-question-translation"
          title={`${question.wordPinyin} — ${question.wordTranslation}`}
        >
          {question.wordTranslation}
        </div>
      </div>
      <div className="cloze-sentence">
        <span>{parts[0]}</span>
        <span className="cloze-blank">____</span>
        <span>{parts[1] ?? ''}</span>
      </div>
      <div className="test-question-options test-question-options--chars">
        {question.options.map((opt) => (
          <button
            key={opt}
            type="button"
            className="test-question-option test-question-option--char"
            onClick={() => onAnswer(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </>
  );
}
