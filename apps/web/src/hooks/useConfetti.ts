import { useCallback, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

/**
 * Хук для запуска конфетти (canvas-confetti).
 *
 * Используется для анимации успеха при завершении сессии.
 * Запускает один залп, не зацикленно.
 *
 * Хранит id всех pending setTimeout в ref и чистит их при unmount —
 * иначе после клика «На главную» (размонтирование SessionComplete) залпы
 * вспыхивали бы поверх HomeScreen. См. PLAN_Features_v0.4 §16.
 */
export function useConfetti() {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const fire = useCallback(() => {
    // Повторный fire() — отменяем висящие таймеры прошлого залпа
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    // Левая пушка
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { x: 0.2 },
      colors: ['#4FC3F7', '#81C784', '#FFB74D', '#E57373', '#DC2626'],
      disableForReducedMotion: true,
    });
    // Правая пушка
    timersRef.current.push(
      setTimeout(() => {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { x: 0.8 },
          colors: ['#4FC3F7', '#81C784', '#FFB74D', '#E57373', '#DC2626'],
          disableForReducedMotion: true,
        });
      }, 200),
    );
    // Центральный залп
    timersRef.current.push(
      setTimeout(() => {
        confetti({
          particleCount: 50,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#4FC3F7', '#81C784', '#FFB74D', '#E57373', '#DC2626'],
          disableForReducedMotion: true,
        });
      }, 400),
    );
  }, []);

  return fire;
}
