import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../api/client';

interface WordAudioInfo {
  audioUrl: string | null;
}

/**
 * Хук для загрузки и воспроизведения аудио слова.
 *
 * Загружает информацию о слове (audioUrl) через API.
 * Предоставляет play(), pause() и флаги isPlaying / isLoading / isAvailable.
 */
export function useAudio(wordId: string | null | undefined) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  // Загружаем audioUrl при смене слова
  useEffect(() => {
    let cancelled = false;
    setAudioUrl(null);
    setIsAvailable(false);
    setIsPlaying(false);

    if (!wordId) return;

    (async () => {
      try {
        setIsLoading(true);
        const word = await apiGet<WordAudioInfo>(`/words/${wordId}`);
        if (cancelled) return;
        if (word.audioUrl) {
          setAudioUrl(word.audioUrl);
          setIsAvailable(true);
        }
      } catch {
        // Тихо игнорируем — аудио опционально
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [wordId]);

  const play = () => {
    if (!audioUrl) return;

    // Переиспользуем существующий объект или создаём новый
    if (!audioRef.current || audioRef.current.src !== audioUrl) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => {
        setIsPlaying(false);
      };
    }

    audioRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        setIsPlaying(false);
      });
  };

  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  return {
    play,
    pause,
    isPlaying,
    isLoading,
    isAvailable,
    audioUrl,
  };
}
