import { Lock, Sparkles } from 'lucide-react';
import type { DeckProgress } from '@hanzi/shared';

interface StudyMapCardProps {
  deck: DeckProgress;
  onClick?: (deckId: string) => void;
}

/**
 * Карточка колоды в секции «Карта изучения» (`StatsScreen`).
 * Показывает название, прогресс-бар и числа; клик ведёт в
 * `LibraryScreen` с фильтром по этой колоде.
 *
 * Цветовая индикация приходит с сервера (`DeckProgress.color`):
 *  - `low`      — 0..24%  (красный)
 *  - `medium`   — 25..49% (жёлтый)
 *  - `high`     — 50..74% (зелёный)
 *  - `complete` — 75..100% (ярко-зелёный)
 */
export default function StudyMapCard({ deck, onClick }: StudyMapCardProps) {
  const isEmpty = deck.totalWords === 0;
  const isComplete = deck.percentage >= 75;

  const handleClick = () => {
    onClick?.(deck.deckId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(deck.deckId);
    }
  };

  return (
    <div
      className={`study-map-card study-map-card-${deck.color}${isEmpty ? ' study-map-card-empty' : ''}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${deck.deckName}: ${deck.learnedWords} из ${deck.totalWords} слов (${deck.percentage}%)`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="study-map-card-head">
        <span className="study-map-card-name">{deck.deckName}</span>
        {isComplete && !isEmpty ? (
          <span className="study-map-card-badge study-map-card-badge-complete" title="Почти освоено">
            <Sparkles size={10} />
          </span>
        ) : isEmpty ? (
          <span className="study-map-card-badge study-map-card-badge-empty" title="Колода пуста">
            <Lock size={10} />
          </span>
        ) : null}
      </div>

      <div className="study-map-card-bar" aria-hidden="true">
        <div
          className="study-map-card-bar-fill"
          style={{ width: `${deck.percentage}%` }}
        />
      </div>

      <div className="study-map-card-meta">
        <span className="study-map-card-counts">
          {deck.learnedWords} / {deck.totalWords}
        </span>
        <span className="study-map-card-pct">{deck.percentage}%</span>
      </div>
    </div>
  );
}
