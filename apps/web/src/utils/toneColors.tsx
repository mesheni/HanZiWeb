import { parsePinyin, type ToneNumber, type ToneSyllable } from '@hanzi/shared';
import { cn } from './cn';

/** Карта тон → CSS-класс */
const TONE_CLASS: Record<ToneNumber, string> = {
  0: 'tone-0',
  1: 'tone-1',
  2: 'tone-2',
  3: 'tone-3',
  4: 'tone-4',
};

/**
 * Карта тон → цвет.
 *
 * Использует CSS-переменные (`--tone-0..4`), определённые в
 * `src/styles/global.css`. Это позволяет одному и тому же ключу
 * отдавать разный оттенок в тёмной и светлой темах.
 *
 * Значения берутся прямо из темы: в inline-стилях допустимо
 * `var(--tone-1)`, и при смене `data-theme` на `<html>` цвета
 * обновляются автоматически.
 */
export const TONE_COLORS: Record<ToneNumber, string> = {
  0: 'var(--tone-0)',
  1: 'var(--tone-1)',
  2: 'var(--tone-2)',
  3: 'var(--tone-3)',
  4: 'var(--tone-4)',
};

export type { ToneNumber, ToneSyllable };

/**
 * Компонент для отображения пиньиня с цветными тонами.
 */
export function PinyinDisplay({ pinyin, className }: { pinyin: string; className?: string }) {
  const syllables = parsePinyin(pinyin);

  return (
    <span className={cn('pinyin-display', className)}>
      {syllables.map((s, i) => (
        <span key={i} className={TONE_CLASS[s.tone]}>
          {s.syllable}
        </span>
      ))}
    </span>
  );
}
