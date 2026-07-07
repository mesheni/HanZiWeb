import { Check, BookOpen } from 'lucide-react';
import type { ReadingTextListItem } from '@hanzi/shared';

interface ReadingTextCardProps {
  item: ReadingTextListItem;
  onClick: () => void;
}

export default function ReadingTextCard({ item, onClick }: ReadingTextCardProps) {
  const knownPercent =
    item.wordCount > 0
      ? Math.round((item.knownWordsCount / item.wordCount) * 100)
      : 0;

  return (
    <div
      className="reading-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="reading-card-main">
        <div className="reading-card-icon">
          <BookOpen size={20} />
        </div>
        <div className="reading-card-info">
          <div className="reading-card-title">{item.title}</div>
          <div className="reading-card-meta">
            HSK {item.hskLevel} · {item.wordCount} слов
          </div>
          {item.readAt && (
            <div className="reading-card-read">
              <Check size={12} /> Прочитано
            </div>
          )}
        </div>
      </div>
      <div className="reading-card-progress">
        <div className="reading-progress-bar-bg">
          <div
            className="reading-progress-bar"
            style={{ width: `${knownPercent}%` }}
          />
        </div>
        <span className="reading-progress-label">{knownPercent}% знакомых</span>
      </div>
    </div>
  );
}
