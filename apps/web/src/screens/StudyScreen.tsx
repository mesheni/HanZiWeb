import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, RefreshCw } from 'lucide-react';
import { useStudySession } from '../hooks/useStudySession';
import { useAudio } from '../hooks/useAudio';
import { useStudyStore } from '../stores/studyStore';
import Flashcard from '../components/Flashcard';
import SessionComplete from '../components/SessionComplete';
import { ProgressBar } from '../components/ui';
import type { SrsRating, StudyMode } from '@hanzi/shared';

function precacheAudioUrls(cards: Array<{ word: { audioUrl?: string | null } }>) {
  if ('caches' in window) {
    cards.forEach((card) => {
      if (card.word.audioUrl) {
        caches.open('audio-cache').then((cache) => {
          cache.add(card.word.audioUrl!).catch(() => {});
        });
      }
    });
  }
}

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

const MODE_CONFIG: Record<StudyMode, { label: string; color: string; bg: string }> = {
  mixed: { label: 'Тренировка', color: '#A78BFA', bg: 'rgba(167,139,250,0.15)' },
  review: { label: 'Повторение', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
  learn: { label: 'Изучение', color: '#34D399', bg: 'rgba(52,211,153,0.15)' },
};

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'Новое', color: '#6EE7B7' },
  learning: { label: 'Учу', color: '#FBBF24' },
  review: { label: 'Повтор', color: '#A78BFA' },
  graduated: { label: 'Усвоено', color: '#34D399' },
};

export default function StudyScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get('mode') ?? 'mixed') as StudyMode;
  const { isLoading, isError, isSessionComplete, rateCard, retrySession } = useStudySession({ mode });

  const cards = useStudyStore((s) => s.cards);
  const currentIndex = useStudyStore((s) => s.currentIndex);
  const isFlipped = useStudyStore((s) => s.isFlipped);
  const progress = useStudyStore((s) => s.progress);
  const flipCard = useStudyStore((s) => s.flipCard);
  const resetSession = useStudyStore((s) => s.resetSession);

  const currentCard = cards[currentIndex];
  const wordId = currentCard?.word.id ?? null;
  const audio = useAudio(wordId);
  const modeCfg = MODE_CONFIG[mode];

  // Статистика для SessionComplete
  const stats = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    const newCount = cards.filter((c) => c.state === 'new').length;
    const reviewCount = cards.filter((c) => c.state !== 'new').length;
    for (const card of cards) {
      if (!card.answered) continue;
      if (card.rating && card.rating >= 3) correct++;
      else incorrect++;
    }
    return { correct, incorrect, total: cards.length, newCount, reviewCount };
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

  // Precache audio when cards load
  useEffect(() => {
    if (cards.length > 0) {
      precacheAudioUrls(cards);
    }
  }, [cards]);

  // При размонтировании сбрасываем стор
  useEffect(() => {
    return () => resetSession();
  }, [resetSession]);

  // Автовоспроизведение аудио при перевороте карточки
  useEffect(() => {
    if (isFlipped && audio.isAvailable) {
      audio.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFlipped]);

  // Клавиатурные сокращения
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isSessionComplete) return;
      if (!currentCard) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        flipCard();
        return;
      }

      if (!isFlipped) return;

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

  // Состояние ошибки
  if (isError && !cards.length) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 4, fontSize: 16, fontWeight: 500 }}>Не удалось загрузить сессию</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Проверьте подключение и попробуйте снова</p>
        </div>
        <button
          onClick={() => retrySession()}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 24px', background: 'var(--accent)',
            border: 'none', borderRadius: 10, color: '#fff',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <RefreshCw size={16} />
          Попробовать снова
        </button>
        <button onClick={() => navigate('/')} style={{ color: 'var(--text-muted)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
          На главную
        </button>
      </div>
    );
  }

  // Состояния загрузки
  if (isLoading) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span className="spinner" style={{ width: 28, height: 28 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка сессии...</span>
        <span style={{
          display: 'inline-block', padding: '3px 10px', borderRadius: 12,
          fontSize: 11, fontWeight: 500,
          color: modeCfg.color, background: modeCfg.bg,
        }}>
          {modeCfg.label}
        </span>
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
        mode={mode}
      />
    );
  }

  if (!currentCard) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 4, fontSize: 16, fontWeight: 500 }}>Нет карточек для изучения</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
            {mode === 'review' ? 'Все слова повторены. Возвращайтесь позже.' : 'Попробуйте другой режим.'}
          </p>
        </div>
        <button
          onClick={() => retrySession()}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', background: 'var(--accent)',
            border: 'none', borderRadius: 10, color: '#fff',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <RefreshCw size={16} />
          Обновить
        </button>
        <button onClick={() => navigate('/')} style={{ color: 'var(--text-muted)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>На главную</button>
      </div>
    );
  }

  const progressPct = Math.round((progress.current / progress.total) * 100);
  const stateCfg: { label: string; color: string } = STATE_LABELS[currentCard.state] ?? { label: 'Новое', color: '#6EE7B7' };

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
        <span style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          color: modeCfg.color,
          background: modeCfg.bg,
        }}>
          {modeCfg.label}
        </span>
        <button
          onClick={() => navigate('/')}
          aria-label="Выйти"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Card state badge */}
      {currentCard.state && (
        <div style={{ padding: '6px 22px 0', textAlign: 'center' }}>
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 500,
            color: stateCfg.color,
            background: `${stateCfg.color}15`,
          }}>
            {stateCfg.label}
          </span>
        </div>
      )}

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
