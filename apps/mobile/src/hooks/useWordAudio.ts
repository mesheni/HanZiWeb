import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { api } from '../bootstrap';

/**
 * F22d: озвучка слова на мобильном. URL берётся из `Word.audioUrl`
 * (mp3 Google TTS, как в web-версии). При смене wordId — перезагрузка.
 */
export function useWordAudio(wordId: string | null): {
  play: () => Promise<void>;
  isAvailable: boolean;
  isLoading: boolean;
} {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAudioUrl(null);
    if (!wordId) return;
    setIsLoading(true);
    api
      .get<{ audioUrl: string | null }>(`/words/${wordId}`)
      .then((result) => {
        if (!cancelled && result.ok) setAudioUrl(result.data.audioUrl);
      })
      .catch(() => {
        // Аудио недоступно — UI показывает кнопку в неактивном состоянии.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wordId]);

  // Разгрузка звука при размонтировании.
  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
    };
  }, []);

  const play = useCallback(async () => {
    if (!audioUrl) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
      soundRef.current = sound;
      await sound.playAsync();
    } catch {
      // Тихий сбой — озвучка не должна ронять карточку.
    }
  }, [audioUrl]);

  return { play, isAvailable: !!audioUrl, isLoading };
}
