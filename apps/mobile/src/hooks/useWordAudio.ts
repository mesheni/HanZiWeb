import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { api } from '../bootstrap';

/**
 * F22d: озвучка слова на мобильном. URL берётся из `Word.audioUrl`
 * (mp3 Google TTS, как в web-версии). При смене wordId — перезагрузка.
 */
export function useWordAudio(
  wordId: string | null,
  audioUrl?: string | null,
): {
  play: () => Promise<void>;
  isAvailable: boolean;
  isLoading: boolean;
} {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolvedUrl(null);
    if (!wordId) return;
    // audioUrl из карточки сессии уже известен — запрос /words/:id на
    // каждую перевёрнутую карточку был лишним сетевым вызовом.
    // undefined (локальная офлайн-карточка) — fallback на fetch.
    if (audioUrl !== undefined) {
      setResolvedUrl(audioUrl);
      return;
    }
    setIsLoading(true);
    api
      .get<{ audioUrl: string | null }>(`/words/${wordId}`)
      .then((result) => {
        if (!cancelled && result.ok) setResolvedUrl(result.data.audioUrl);
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
  }, [wordId, audioUrl]);

  // Разгрузка звука при размонтировании.
  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
    };
  }, []);

  const play = useCallback(async () => {
    if (!resolvedUrl) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: resolvedUrl });
      soundRef.current = sound;
      await sound.playAsync();
    } catch {
      // Тихий сбой — озвучка не должна ронять карточку.
    }
  }, [resolvedUrl]);

  return { play, isAvailable: !!resolvedUrl, isLoading };
}
