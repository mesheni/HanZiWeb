import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Flame, Zap } from 'lucide-react';
import { useConfetti } from '../hooks/useConfetti';
import { useStreak } from '../queries/stats';
import { Button } from './ui';

interface SessionCompleteProps {
  total: number;
  correct: number;
  incorrect: number;
  xpEarned: number;
}

/**
 * Экран завершения сессии: показывает статистику и запускает конфетти.
 */
export default function SessionComplete({
  total,
  correct,
  incorrect,
  xpEarned,
}: SessionCompleteProps) {
  const navigate = useNavigate();
  const fireConfetti = useConfetti();
  const { data: streakData } = useStreak();

  const streak = streakData?.currentStreak ?? 0;

  // Запуск конфетти один раз при монтировании
  useEffect(() => {
    fireConfetti();
  }, [fireConfetti]);

  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="session-complete">
      <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
      <h2 className="session-complete-title">Сессия завершена!</h2>
      <p className="session-complete-sub">Отличная работа — продолжай в том же духе</p>

      <div className="session-complete-stats">
        <div className="sc-stat">
          <div className="sc-stat-number" style={{ color: 'var(--tone-2)' }}>
            {correct}
          </div>
          <div className="sc-stat-label">правильно</div>
        </div>
        <div className="sc-stat">
          <div className="sc-stat-number" style={{ color: 'var(--tone-4)' }}>
            {incorrect}
          </div>
          <div className="sc-stat-label">ошибок</div>
        </div>
        <div className="sc-stat">
          <div className="sc-stat-number">{accuracy}%</div>
          <div className="sc-stat-label">точность</div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 28,
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={16} className="text-accent" />
          <span style={{ fontSize: 14, fontWeight: 500 }}>+{xpEarned} XP</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Flame size={16} className="text-tone-3" />
          <span style={{ fontSize: 14, fontWeight: 500 }}>{streak} дней подряд</span>
        </div>
        <Trophy size={16} className="text-tone-2" />
      </div>

      <div className="session-complete-buttons">
        <Button variant="primary" size="lg" className="flex-1" onClick={() => navigate('/study')}>
          Ещё сессия
        </Button>
        <Button variant="secondary" size="lg" className="flex-1" onClick={() => navigate('/')}>
          На главную
        </Button>
      </div>
    </div>
  );
}
