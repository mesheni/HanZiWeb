import { useCallback } from 'react';
import confetti from 'canvas-confetti';

/**
 * Хук для запуска конфетти (canvas-confetti).
 *
 * Используется для анимации успеха при завершении сессии.
 * Запускает один залп, не зацикленно.
 */
export function useConfetti() {
  const fire = useCallback(() => {
    // Левая пушка
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { x: 0.2 },
      colors: ['#4FC3F7', '#81C784', '#FFB74D', '#E57373', '#DC2626'],
      disableForReducedMotion: true,
    });
    // Правая пушка
    setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.8 },
        colors: ['#4FC3F7', '#81C784', '#FFB74D', '#E57373', '#DC2626'],
        disableForReducedMotion: true,
      });
    }, 200);
    // Центральный залп
    setTimeout(() => {
      confetti({
        particleCount: 50,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#4FC3F7', '#81C784', '#FFB74D', '#E57373', '#DC2626'],
        disableForReducedMotion: true,
      });
    }, 400);
  }, []);

  return fire;
}
