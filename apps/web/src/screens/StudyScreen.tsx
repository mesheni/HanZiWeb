import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useStudySession } from '../hooks/useStudySession';
import { useAudio } from '../hooks/useAudio';
import { useStudyStore } from '../stores/studyStore';
import Flashcard from '../components/Flashcard';
import SessionComplete from '../components/SessionComplete';
import { ProgressBar } from '../components/ui';
import type { SrsRating } from '@hanzi/shared';

interface RatingOption {
  rating: SrsRating;
  label: string;
  hint: string;
  className: string;
}

const RATING_OPTIONS: RatingOption[] = [
  { rating: 1, label: 'Не помню', hint: 'через 1 мин', className: 'rate-again' },
  { rating: 2, label: 'Трудно', hint: 'через 10 мин', className: 'rate-hard' },
  { rating: 3, label: 'Помню', hint: 'через 1 день', className: 'rate-good' },
  { rating: 4, label: 'Легко', hint: 'через 4 дня', className: 'rate-easy' },
];

export default function StudyScreen() {
  const navigate = useNavigate();
  const { isLoading, isSessionComplete, rateCard } = useStudySession();

  const cards = useStudyStore((s) => s.cards);
  const currentIndex = useStudyStore((s) => s.currentIndex);
  const isFlipped = useStudyStore((s) => s.isFlipped);
  const progress = useStudyStore((s) => s.progress);
  const flipCard = useStudyStore((s) => s.flipCard);
  const resetSession = useStudyStore((s) => s.resetSession);

  const currentCard = cards[currentIndex];
  const wordId = currentCard?.word.id ?? null;
  const audio = useAudio(wordId);

  // Автовоспроизведение аудио при перевороте карточки
  useEffect(() => {
    if (isFlipped && audio.isAvailable) {
      audio.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFlipped]);

  // Клавиатурные сокращения: 1=Again, 2=Hard, 3=Good, 4=Easy, Space=flip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isSessionComplete) return;
      if (!currentCard) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        flipCard();
        return;
      }

      if (!isFlipped) return; // оценки доступны только после переворота

      const map: Record<string, SrsRating> = {
        '1': 1,
        '2': 2,
        '3': 3,
        '4': 4,
      };
      const rating = map[e.key];
      if (rating !== undefined) {
        e.preventDefault();
        rateCard(rating);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSessionComplete, currentCard, isFlipped, flipCard, rateCard]);

  // Статистика для SessionComplete
  const stats = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    for (const card of cards) {
      if (!card.answered) continue;
      if (card.rating && card.rating >= 3) correct++;
      else incorrect++;
    }
    return { correct, incorrect, total: cards.length };
  }, [cards]);

  // Подсчёт XP
  const xpEarned = useMemo(() => {
    let xp = 0;
    for (const card of cards) {
      if (card.answered && card.rating) {
        xp += { 1: 0, 2: 1, 3: 3, 4: 5 }[card.rating] ?? 0;
      }
    }
    return xp;
  }, [cards]);

  // При размонтировании сбрасываем стор
  useEffect(() => {
    return () => resetSession();
  }, [resetSession]);

  // Состояния загрузки
  if (isLoading) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  if (isSessionComplete) {
    return (
      <SessionComplete
        total={stats.total}
        correct={stats.correct}
        incorrect={stats.incorrect}
        xpEarned={xpEarned}
      />
    );
  }

  if (!currentCard) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>Нет карточек для изучения.</p>
          <button onClick={() => navigate('/')} style={{ color: 'var(--accent)' }}>На главную</button>
        </div>
      </div>
    );
  }

  const progressPct = Math.round((progress.current / progress.total) * 100);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Progress bar */}
      <div style={{ padding: '8px 22px 0' }}>
        <ProgressBar value={progressPct} />
      </div>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 22px',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {progress.current + 1} / {progress.total}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Повторение</span>
        <button
          onClick={() => navigate('/')}
          aria-label="Выйти"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Card area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '14px 28px',
        }}
      >
        <Flashcard
          word={currentCard.word}
          isFlipped={isFlipped}
          onFlip={flipCard}
          onReplayAudio={() => audio.play()}
          audioLoading={audio.isLoading}
          hasAudio={audio.isAvailable}
        />
      </div>

      {/* Footer — оценки доступны только после переворота */}
      <div style={{ padding: '10px 22px 20px', flexShrink: 0 }}>
        {!isFlipped ? (
          <button
            onClick={flipCard}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 210,
              margin: '0 auto',
              padding: '12px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Показать ответ
          </button>
        ) : (
          <div className="rating-row">
            {RATING_OPTIONS.map((opt) => (
              <button
                key={opt.rating}
                className={`rate-btn ${opt.className}`}
                onClick={() => rateCard(opt.rating)}
              >
                {opt.label}
                <small>{opt.hint}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
