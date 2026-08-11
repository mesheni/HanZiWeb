import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import { PinyinDisplay } from '../utils/toneColors';

interface HandwritingPracticeProps {
  character: string;
  pinyin?: string;
  translation?: string;
  showAnimation?: boolean;
}

type PracticeMode = 'watch' | 'write';

interface CharWriterHandle {
  animate: (onComplete?: () => void) => void;
  /** Показать порядок черт текущего символа (прерывает quiz). */
  show: () => void;
  /** Начать распознавание заново. */
  restart: () => void;
}

interface CharWriterProps {
  char: string;
  mode: PracticeMode;
  onSymbolComplete?: () => void;
  onMistake?: () => void;
}

const CHAR_SIZE = 220;

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Один иероглиф. В режиме `watch` — анимация порядка черт; в режиме
 * `write` (F28b) — интерактивное распознавание написанного
 * (hanzi-writer quiz): правильные штрихи подсвечиваются, ошибки
 * считаются, по завершении — авто-переход к следующему символу.
 */
const CharWriter = forwardRef<CharWriterHandle, CharWriterProps>(
  ({ char, mode, onSymbolComplete, onMistake }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const writerRef = useRef<ReturnType<typeof HanziWriter.create> | null>(null);
    const completeTimerRef = useRef<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);
    const [correct, setCorrect] = useState(0);
    const [mistakes, setMistakes] = useState(0);
    const [done, setDone] = useState(false);
    const [total, setTotal] = useState(0);

    useEffect(() => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '';
      setLoading(true);
      setCorrect(0);
      setMistakes(0);
      setDone(false);
      setTotal(0);

      writerRef.current = HanziWriter.create(containerRef.current, char, {
        width: CHAR_SIZE,
        height: CHAR_SIZE,
        padding: 12,
        strokeColor: readCssVar('--text-primary', '#E8EAED'),
        radicalColor: readCssVar('--accent', '#DC2626'),
        outlineColor: readCssVar('--text-muted', '#45475A'),
        showCharacter: mode === 'watch',
        strokeAnimationSpeed: 1.2,
        delayBetweenStrokes: 250,
        charDataLoader: (char, onComplete) => {
          fetch(`/hanzi-writer-data/${encodeURIComponent(char)}.json`)
            .then((res) => res.json())
            .then((data) => {
              setTotal(Array.isArray(data?.strokes) ? data.strokes.length : 0);
              onComplete(data);
            })
            .catch(() => setLoading(false));
        },
        onLoadCharDataSuccess: () => {
          setLoading(false);
          if (mode === 'write') {
            writerRef.current?.quiz({
              highlightOnComplete: true,
              highlightColor: readCssVar('--success', '#22C55E'),
              onCorrectStroke: () => setCorrect((c) => c + 1),
              onMistake: () => {
                setMistakes((m) => m + 1);
                onMistake?.();
              },
              onComplete: () => {
                setDone(true);
                completeTimerRef.current = window.setTimeout(() => onSymbolComplete?.(), 700);
              },
            });
          }
        },
      });

      return () => {
        if (completeTimerRef.current !== null) {
          window.clearTimeout(completeTimerRef.current);
          completeTimerRef.current = null;
        }
        if (containerRef.current) containerRef.current.innerHTML = '';
        writerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [char, mode, attempt]);

    useImperativeHandle(
      ref,
      () => ({
        animate: (onComplete) => writerRef.current?.animateCharacter({ onComplete }),
        show: () => {
          writerRef.current?.cancelQuiz();
          writerRef.current?.animateCharacter();
        },
        restart: () => setAttempt((a) => a + 1),
      }),
      [],
    );

    return (
      <div className="hw-char-cell">
        <div ref={containerRef} className="handwriting-canvas" />
        {loading && (
          <div className="handwriting-loading">
            <span className="spinner" />
          </div>
        )}
        {mode === 'write' && !loading && (
          <div className="handwriting-quiz-stats">
            <span className={done ? 'handwriting-quiz-ok' : undefined}>
              {done ? '✓' : `Штрихи: ${correct}/${total || '…'}`}
            </span>
            <span>Ошибки: {mistakes}</span>
          </div>
        )}
      </div>
    );
  },
);
CharWriter.displayName = 'CharWriter';

export default function HandwritingPractice({
  character,
  pinyin,
  translation,
  showAnimation = true,
}: HandwritingPracticeProps) {
  const chars = Array.from(character);
  const refs = useRef<(CharWriterHandle | null)[]>([]);
  const symbolIndexRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<PracticeMode>('watch');
  const [symbolIndex, setSymbolIndex] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [totalMistakes, setTotalMistakes] = useState(0);

  const playSequence = useCallback(
    (index = 0) => {
      if (index >= chars.length) {
        setPlaying(false);
        return;
      }
      setPlaying(true);
      refs.current[index]?.animate(() => playSequence(index + 1));
    },
    [chars.length],
  );

  useEffect(() => {
    if (mode !== 'watch' || !showAnimation) return;
    const t = setTimeout(() => playSequence(0), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, showAnimation, character]);

  const handleSymbolComplete = useCallback(() => {
    if (symbolIndexRef.current < chars.length - 1) {
      symbolIndexRef.current += 1;
      setSymbolIndex(symbolIndexRef.current);
    } else {
      setAllDone(true);
    }
  }, [chars.length]);

  const handleMistake = useCallback(() => {
    setTotalMistakes((m) => m + 1);
  }, []);

  const switchMode = (next: PracticeMode) => {
    setMode(next);
    symbolIndexRef.current = 0;
    setSymbolIndex(0);
    setAllDone(false);
    setTotalMistakes(0);
  };

  const restartAll = () => {
    symbolIndexRef.current = 0;
    setSymbolIndex(0);
    setAllDone(false);
    setTotalMistakes(0);
  };

  const showHint = mode === 'watch' || allDone;

  return (
    <div className="handwriting-practice">
      <div className="handwriting-controls">
        <button
          type="button"
          className={`hw-btn${mode === 'watch' ? ' hw-btn-primary' : ' hw-btn-secondary'}`}
          onClick={() => switchMode('watch')}
        >
          Порядок черт
        </button>
        <button
          type="button"
          className={`hw-btn${mode === 'write' ? ' hw-btn-primary' : ' hw-btn-secondary'}`}
          onClick={() => switchMode('write')}
        >
          Написать самому
        </button>
      </div>

      {mode === 'write' ? (
        <div className="handwriting-write">
          {!allDone ? (
            <>
              <div className="handwriting-symbol-progress">
                Символ {symbolIndex + 1} из {chars.length}
                {totalMistakes > 0 && <span> · Ошибки: {totalMistakes}</span>}
              </div>
              <CharWriter
                key={`${character}-${symbolIndex}`}
                char={chars[symbolIndex]!}
                mode="write"
                ref={(el) => (refs.current[symbolIndex] = el)}
                onSymbolComplete={handleSymbolComplete}
                onMistake={handleMistake}
              />
              <div className="handwriting-controls">
                <button
                  type="button"
                  className="hw-btn hw-btn-outline"
                  onClick={() => refs.current[symbolIndex]?.show()}
                >
                  Показать
                </button>
                <button
                  type="button"
                  className="hw-btn hw-btn-outline"
                  onClick={() => refs.current[symbolIndex]?.restart()}
                >
                  Заново
                </button>
                <button
                  type="button"
                  className="hw-btn hw-btn-outline"
                  onClick={handleSymbolComplete}
                >
                  Пропустить
                </button>
              </div>
            </>
          ) : (
            <div className="handwriting-all-done">
              <div className="handwriting-all-done-title">Отлично!</div>
              {totalMistakes > 0 && (
                <div className="handwriting-all-done-sub">
                  Ошибок при написании: {totalMistakes}
                </div>
              )}
              <button type="button" className="hw-btn hw-btn-primary" onClick={restartAll}>
                Начать заново
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="handwriting-chars-row">
          {chars.map((char, i) => (
            <CharWriter
              key={`${character}-${i}`}
              char={char}
              mode="watch"
              ref={(el) => (refs.current[i] = el)}
            />
          ))}
        </div>
      )}

      {showHint && (pinyin || translation) && (
        <div className="handwriting-hint">
          {pinyin && <PinyinDisplay pinyin={pinyin} className="handwriting-hint-pinyin" />}
          {translation && <div className="handwriting-hint-translation">{translation}</div>}
        </div>
      )}

      {mode === 'watch' && (
        <button
          className="hw-btn hw-btn-primary"
          onClick={() => playSequence(0)}
          disabled={playing}
        >
          {playing ? 'Показываю...' : 'Смотреть порядок черт'}
        </button>
      )}
    </div>
  );
}
