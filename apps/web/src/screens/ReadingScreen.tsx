import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useReadingTexts } from '../queries/reading';
import ReadingTextCard from '../components/reading/ReadingTextCard';

const HSK_CHIPS = [0, 1, 2, 3, 4, 5, 6] as const;

export default function ReadingScreen() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [hskLevel, setHskLevel] = useState<number | null>(null);

  const { data: texts = [], isLoading } = useReadingTexts(hskLevel ?? undefined);

  const filtered = texts.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="reading-screen">
      <div className="reading-header">
        <h1 className="reading-title">Чтение</h1>
        <p className="reading-subtitle">
          Интерактивные тексты по уровням HSK
        </p>
      </div>

      <div className="reading-search">
        <Search size={14} className="reading-search-icon" />
        <input
          type="text"
          className="reading-search-input"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="reading-chips">
        {HSK_CHIPS.map((level) => {
          const active = hskLevel === (level === 0 ? null : level);
          return (
            <button
              key={level}
              type="button"
              className={`reading-chip${active ? ' reading-chip-active' : ''}`}
              onClick={() => setHskLevel(level === 0 ? null : level)}
            >
              {level === 0 ? 'Все' : `HSK ${level}`}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="reading-empty">Загрузка текстов...</div>
      ) : filtered.length === 0 ? (
        <div className="reading-empty">Нет текстов по выбранному фильтру</div>
      ) : (
        <div className="reading-grid">
          {filtered.map((text) => (
            <ReadingTextCard
              key={text.id}
              item={text}
              onClick={() => navigate(`/reading/${text.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
