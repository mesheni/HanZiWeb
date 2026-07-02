import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import { PinyinDisplay } from '../utils/toneColors';

interface HandwritingPracticeProps {
  character: string;
  pinyin?: string;
  translation?: string;
  showAnimation?: boolean;
}

interface CharWriterHandle {
  animate: (onComplete?: () => void) => void;
}

const CHAR_SIZE = 220;

const CharWriter = forwardRef<CharWriterHandle, { char: string }>(({ char }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    setLoading(true);

    writerRef.current = HanziWriter.create(containerRef.current, char, {
      width: CHAR_SIZE,
      height: CHAR_SIZE,
      padding: 12,
      strokeColor: '#E8EAED',
      radicalColor: '#DC2626',
      outlineColor: '#45475A',
      showCharacter: true,
      strokeAnimationSpeed: 1.2,
      delayBetweenStrokes: 250,
      charDataLoader: (char, onComplete) => {
        fetch(`/hanzi-writer-data/${encodeURIComponent(char)}.json`)
          .then((res) => res.json())
          .then(onComplete)
          .catch(() => setLoading(false));
      },
      onLoadCharDataSuccess: () => setLoading(false),
    });

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      writerRef.current = null;
    };
  }, [char]);

  useImperativeHandle(
    ref,
    () => ({
      animate: (onComplete) => writerRef.current?.animateCharacter({ onComplete }),
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
    </div>
  );
});
CharWriter.displayName = 'CharWriter';

export default function HandwritingPractice({
  character,
  pinyin,
  translation,
  showAnimation = true,
}: HandwritingPracticeProps) {
  const chars = Array.from(character);
  const refs = useRef<(CharWriterHandle | null)[]>([]);
  const [playing, setPlaying] = useState(false);

  const playSequence = (index = 0) => {
    if (index >= chars.length) {
      setPlaying(false);
      return;
    }
    setPlaying(true);
    refs.current[index]?.animate(() => playSequence(index + 1));
  };

  useEffect(() => {
    if (!showAnimation) return;
    const t = setTimeout(() => playSequence(0), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  return (
    <div className="handwriting-practice">
      <div className="handwriting-chars-row">
        {chars.map((char, i) => (
          <CharWriter key={`${character}-${i}`} char={char} ref={(el) => (refs.current[i] = el)} />
        ))}
      </div>

      {(pinyin || translation) && (
        <div className="handwriting-hint">
          {pinyin && <PinyinDisplay pinyin={pinyin} className="handwriting-hint-pinyin" />}
          {translation && <div className="handwriting-hint-translation">{translation}</div>}
        </div>
      )}

      <button className="hw-btn hw-btn-primary" onClick={() => playSequence(0)} disabled={playing}>
        {playing ? 'Показываю...' : 'Смотреть порядок черт'}
      </button>
    </div>
  );
}
