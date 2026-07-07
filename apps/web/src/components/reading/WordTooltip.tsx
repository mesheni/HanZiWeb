import { Volume2, Star } from 'lucide-react';
import { PinyinDisplay } from '../../utils/toneColors';
import type { ReadingTokenWord, WordState } from '@hanzi/shared';

interface WordTooltipProps {
  word: ReadingTokenWord;
  state: WordState | null;
  isPriority: boolean;
  onAddPriority: () => void;
  onSpeak: () => void;
}

export default function WordTooltip({
  word,
  state,
  isPriority,
  onAddPriority,
  onSpeak,
}: WordTooltipProps) {
  return (
    <div className="reading-tooltip">
      <div className="reading-tooltip-header">
        <span className="reading-tooltip-char">{word.character}</span>
        <div className="reading-tooltip-actions">
          <button
            type="button"
            className="reading-tooltip-btn"
            onClick={onSpeak}
            aria-label="Прослушать"
            title="Прослушать"
          >
            <Volume2 size={14} />
          </button>
          <button
            type="button"
            className={`reading-tooltip-btn${isPriority ? ' reading-tooltip-btn-active' : ''}`}
            onClick={onAddPriority}
            aria-label={isPriority ? 'В приоритете' : 'Добавить в приоритет'}
            title={isPriority ? 'В приоритете' : 'Добавить в приоритет'}
          >
            <Star size={14} fill={isPriority ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
      <div className="reading-tooltip-pinyin">
        <PinyinDisplay pinyin={word.pinyin} />
      </div>
      <div className="reading-tooltip-translation">{word.translation}</div>
      {state === 'graduated' && (
        <span className="reading-tooltip-known">Изучено</span>
      )}
    </div>
  );
}
