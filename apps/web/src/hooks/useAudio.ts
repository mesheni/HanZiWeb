import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../api/client';

interface WordAudioInfo {
  audioUrl: string | null;
  character: string;
}

/**
 * Хук для загрузки и воспроизведения аудио слова.
 *
 * Приоритет источников:
 *  1. Сгенерированный mp3 из `Word.audioUrl` (Google Cloud TTS).
 *  2. Fallback: `window.speechSynthesis` с `SpeechSynthesisUtterance`
 *     (`lang = 'zh-CN'`, `rate = 0.9`). Срабатывает автоматически,
 *     если у слова нет `audioUrl` — чтобы озвучка работала в dev
 *     без `GOOGLE_APPLICATION_CREDENTIALS` и для новых слов.
 *
 * `isAvailable = true`, если доступен хотя бы один из источников.
 *
 * На смене `wordId` текущее аудио (включая речь) принудительно
 * останавливается — чтобы новая карточка начинала «с тишины».
 */
export function useAudio(wordId: string | null | undefined) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [character, setCharacter] = useState<string>('');
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAudioUrl(null);
    setCharacter('');
    setIsAvailable(false);
    setIsPlaying(false);

    if (!wordId) return;

    (async () => {
      try {
        setIsLoading(true);
        const word = await apiGet<WordAudioInfo>(`/words/${wordId}`);
        if (cancelled) return;
        const hasMp3 = !!word.audioUrl;
        const hasFallback = !!word.character && supportsSpeech();
        setAudioUrl(word.audioUrl);
        setCharacter(word.character);
        setIsAvailable(hasMp3 || hasFallback);
      } catch {
        // Тихо игнорируем — аудио опционально.
        if (!cancelled) {
          // Если даже запрос упал — пробуем хоть speech fallback,
          // но для него нужен character. Оставляем isAvailable = false.
        }
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
      cancelSpeech();
    };
  }, [wordId]);

  const play = () => {
    // 1) Сгенерированный mp3 — пробуем первым.
    if (audioUrl) {
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
      return;
    }

    // 2) Fallback: браузерный speech synthesis.
    if (character && supportsSpeech()) {
      try {
        cancelSpeech();
        const utter = new SpeechSynthesisUtterance(character);
        utter.lang = 'zh-CN';
        utter.rate = 0.9;
        utter.onstart = () => setIsPlaying(true);
        utter.onend = () => setIsPlaying(false);
        utter.onerror = () => setIsPlaying(false);
        window.speechSynthesis.speak(utter);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    cancelSpeech();
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

function supportsSpeech(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function cancelSpeech(): void {
  if (supportsSpeech()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Тихо игнорируем.
    }
  }
}
