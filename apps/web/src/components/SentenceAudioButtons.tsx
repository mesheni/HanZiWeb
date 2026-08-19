import { useEffect, useRef, useState } from 'react';
import { Volume2, Snail } from 'lucide-react';

interface SentenceAudioButtonsProps {
  /** Аудио носителя: обычная скорость (null → браузерный TTS). */
  audioUrl?: string | null;
  /** Аудио носителя: замедленная скорость (null → TTS с rate 0.55). */
  audioSlowUrl?: string | null;
  /** Текст для TTS-fallback. */
  fallbackText: string;
  /** Размер иконок lucide. */
  size?: number;
}

type Playing = 'fast' | 'slow' | null;

/**
 * Кнопки прослушивания предложения-примера: «обычное» и «медленное»
 * произношение носителя (mp3 из hsk_audio-датасета). Если аудио нет —
 * fallback на браузерный SpeechSynthesis (zh-CN).
 *
 * stopPropagation на кликах: компонент живёт на кликабельных
 * поверхностях (флеш-карточка переворачивается по клику).
 */
export default function SentenceAudioButtons({
  audioUrl,
  audioSlowUrl,
  fallbackText,
  size = 14,
}: SentenceAudioButtonsProps) {
  const [playing, setPlaying] = useState<Playing>(null);
  const [loading, setLoading] = useState<Playing>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (typeof window !== 'undefined') {
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  function stopPlayback() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
    setPlaying(null);
    setLoading(null);
  }

  function speakWithTts(kind: 'fast' | 'slow') {
    const utter = new SpeechSynthesisUtterance(fallbackText);
    utter.lang = 'zh-CN';
    utter.rate = kind === 'slow' ? 0.55 : 0.9;
    utter.onstart = () => setPlaying(kind);
    utter.onend = () => setPlaying(null);
    utter.onerror = () => setPlaying(null);
    window.speechSynthesis.speak(utter);
  }

  function play(kind: 'fast' | 'slow') {
    if (playing === kind) {
      stopPlayback();
      return;
    }
    stopPlayback();

    const url = kind === 'slow' ? audioSlowUrl : audioUrl;
    if (!url) {
      speakWithTts(kind);
      return;
    }

    const el = new Audio(url);
    audioRef.current = el;
    setLoading(kind);
    el.onplay = () => {
      setLoading(null);
      setPlaying(kind);
    };
    el.onended = () => {
      setPlaying(null);
      setLoading(null);
      audioRef.current = null;
    };
    el.onerror = () => {
      // Файл ещё не импортирован/недоступен — не оставляем кнопку мёртвой.
      setLoading(null);
      audioRef.current = null;
      speakWithTts(kind);
    };
    void el.play().catch(() => {
      setLoading(null);
      audioRef.current = null;
      speakWithTts(kind);
    });
  }

  const handleClick = (kind: 'fast' | 'slow') => (e: React.MouseEvent) => {
    e.stopPropagation();
    play(kind);
  };

  return (
    <div className="sentence-audio-buttons">
      <button
        type="button"
        className="sentence-audio-btn"
        onClick={handleClick('fast')}
        aria-label="Прослушать предложение"
        title={audioUrl ? 'Произношение носителя' : 'Браузерный TTS (fallback)'}
      >
        <Volume2 size={size} className={playing === 'fast' ? 'sentence-audio-active' : undefined} />
      </button>
      <button
        type="button"
        className="sentence-audio-btn"
        onClick={handleClick('slow')}
        aria-label="Прослушать предложение медленно"
        title={audioSlowUrl ? 'Медленно (носитель)' : 'Медленно (браузерный TTS)'}
      >
        <Snail size={size} className={playing === 'slow' ? 'sentence-audio-active' : undefined} />
      </button>
      {loading && <span className="sentence-audio-spinner spinner" />}
    </div>
  );
}
