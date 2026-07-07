import { PinyinDisplay } from '../../utils/toneColors';
import type { ReadingToken } from '@hanzi/shared';

interface ReadingWordProps {
  token: ReadingToken;
  showPinyin: boolean;
  onClick: (token: ReadingToken) => void;
}

export default function ReadingWord({ token, showPinyin, onClick }: ReadingWordProps) {
  if (!token.word) {
    return <span className="reading-token-punct">{token.surface}</span>;
  }

  const className = `reading-word${
    token.state === 'graduated' ? ' reading-word--known' : ''
  }${token.isPriority ? ' reading-word--priority' : ''}`;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(token);
    }
  };

  if (showPinyin) {
    return (
      <ruby
        className={className}
        onClick={() => onClick(token)}
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
      onClick={() => onClick(token)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {token.surface}
    </span>
  );
}
