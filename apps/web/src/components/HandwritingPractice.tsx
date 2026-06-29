import { useEffect, useRef, useState, useCallback } from 'react';
import HanziWriter from 'hanzi-writer';

interface HandwritingPracticeProps {
  character: string;
  showAnimation?: boolean;
}

export default function HandwritingPractice({ character, showAnimation = true }: HandwritingPracticeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  const initWriter = useCallback(() => {
    if (!containerRef.current || !character) return;
    containerRef.current.innerHTML = '';

    writerRef.current = HanziWriter.create(containerRef.current, character, {
      width: 300,
      height: 300,
      padding: 10,
      strokeColor: '#E8EAED',
      radicalColor: '#DC2626',
      outlineColor: '#45475A',
      drawingColor: '#DC2626',
      highlightColor: '#4FC3F7',
      showCharacter: false,
      showHintAfterMisses: 3,
      strokeAnimationSpeed: 1.2,
      delayBetweenStrokes: 300,
      delayBetweenLoops: 1500,
      onLoadCharData: () => setLoading(false),
    });

    if (showAnimation) {
      writerRef.current.animateCharacter();
    }
  }, [character, showAnimation]);

  useEffect(() => {
    initWriter();
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      writerRef.current = null;
    };
  }, [initWriter]);

  const handleWatchAnimation = () => {
    writerRef.current?.animateCharacter();
  };

  const handleStartPractice = () => {
    writerRef.current?.loopCharacterAnimation();
  };

  const handleQuiz = () => {
    writerRef.current?.quiz({
      showCharacter: false,
      showHintAfterMisses: 3,
    });
  };

  return (
    <div className="handwriting-practice">
      <div ref={containerRef} className="handwriting-canvas" />
      {loading && (
        <div className="handwriting-loading">
          <span className="spinner" />
          <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>Загрузка...</span>
        </div>
      )}
      <div className="handwriting-controls">
        <button className="hw-btn hw-btn-primary" onClick={handleWatchAnimation}>
          Смотреть порядок черт
        </button>
        <button className="hw-btn hw-btn-secondary" onClick={handleStartPractice}>
          Обводить по образцу
        </button>
        <button className="hw-btn hw-btn-outline" onClick={handleQuiz}>
          Написать по памяти
        </button>
      </div>
    </div>
  );
}
