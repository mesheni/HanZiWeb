import { PinyinDisplay } from '../../utils/toneColors';
import type { ReadingToken } from '@hanzi/shared';

interface ReadingWordProps {
  token: ReadingToken;
  showPinyin: boolean;
  onClick: (token: ReadingToken, position: { x: number; y: number }) => void;
}

export default function ReadingWord({ token, showPinyin, onClick }: ReadingWordProps) {
  if (!token.word) {
    return <span className="reading-token-punct">{token.surface}</span>;
  }

  const className = `reading-word${
    token.state === 'graduated' ? ' reading-word--known' : ''
  }${token.isPriority ? ' reading-word--priority' : ''}`;

  const getTooltipPosition = (target: EventTarget | null): { x: number; y: number } => {
    if (target instanceof HTMLElement) {
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.bottom + 8 };
    }
    return { x: 0, y: 0 };
  };

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    onClick(token, getTooltipPosition(e.currentTarget));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(token, getTooltipPosition(e.currentTarget));
    }
  };

  if (showPinyin) {
    return (
      <ruby
        className={className}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
      >
        {token.surface}
        <rt>
          <PinyinDisplay pinyin={token.word.pinyin} />
        </rt>
      </ruby>
    );
  }

  return (
    <span
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {token.surface}
    </span>
  );
}
