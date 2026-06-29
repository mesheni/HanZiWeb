import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useWords } from '@/queries/words';
import HandwritingPractice from '@/components/HandwritingPractice';
import { useAuthStore, isPro } from '@/stores/authStore';

export default function HandwritingScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialChar = searchParams.get('char') || '';
  const [selectedChar, setSelectedChar] = useState(initialChar);
  const [searchQuery, setSearchQuery] = useState('');
  const user = useAuthStore((s) => s.user);

  const { data: words } = useWords({ search: searchQuery || undefined });

  return (
    <div className="handwriting-screen">
      <header className="handwriting-header">
        <button className="hw-back-btn" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft size={20} />
        </button>
        <h2 className="handwriting-title">Практика письма</h2>
        {!isPro(user) && (
          <button className="hw-upgrade-badge" onClick={() => navigate('/pricing')}>
            Pro
          </button>
        )}
      </header>

      <div className="handwriting-search">
        <Search size={16} className="hw-search-icon" />
        <input
          type="text"
          className="hw-search-input"
          placeholder="Поиск иероглифа..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {selectedChar ? (
        <div className="handwriting-main">
          <HandwritingPractice character={selectedChar} key={selectedChar} />
          <button className="hw-close-char" onClick={() => setSelectedChar('')}>
            Выбрать другой иероглиф
          </button>
        </div>
      ) : (
        <div className="handwriting-word-list">
          {words?.data?.map((word: any) => (
            <button
              key={word.id}
              className="hw-word-item"
              onClick={() => setSelectedChar(word.character)}
            >
              <span className="hw-word-char">{word.character}</span>
              <span className="hw-word-pinyin">{word.pinyin}</span>
              <span className="hw-word-translation">{word.translation}</span>
            </button>
          ))}
          {(!words?.data || words.data.length === 0) && (
            <p className="hw-empty">Начните вводить иероглиф для поиска</p>
          )}
        </div>
      )}
    </div>
  );
}
