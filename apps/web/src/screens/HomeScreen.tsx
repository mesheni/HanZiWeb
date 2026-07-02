import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useDashboard } from '../queries/stats';
import { useWords } from '../queries/words';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getDb } from '../db/database';
import Badge from '../components/ui/Badge';
import { PinyinDisplay } from '../utils/toneColors';

function CircularProgress({ value, max = 100, size = 100, strokeWidth = 6 }: { value: number; max?: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-default)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="var(--text-primary)" fontSize={size * 0.22} fontWeight={600}>
        {Math.round(progress * 100)}%
      </text>
    </svg>
  );
}

export default function HomeScreen() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { data: dashboard, isLoading } = useDashboard();
  const { data: recentData } = useWords({ limit: 5 });
  const recentWords = recentData?.data ?? [];
  const [dlState, setDlState] = useState<'idle' | 'loading' | 'done'>('idle');

  const handleDownloadOffline = async () => {
    setDlState('loading');
    try {
      const db = getDb();
      if (!db) {
        setDlState('idle');
        return;
      }
      const words: any[] = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const res = await fetch(`/api/words?limit=${limit}&offset=${offset}`, {
          credentials: 'include',
        });
        const json = await res.json();
        const pageWords = json.data ?? [];
        words.push(...pageWords);

        if (pageWords.length < limit || !json.pagination?.total) {
          break;
        }

        offset += limit;
        if (offset >= json.pagination.total) {
          break;
        }
      }

      for (const w of words) {
        await db.words.upsert({
          id: w.id,
          character: w.character,
          pinyin: w.pinyin,
          translation: w.translation,
          hskLevel: w.hskLevel,
          audioUrl: w.audioUrl ?? null,
          mnemonic: w.mnemonic ?? null,
          createdAt: w.createdAt ?? new Date().toISOString(),
          examples: w.examples ?? [],
        });
      }
      setDlState('done');
      setTimeout(() => setDlState('idle'), 3000);
    } catch {
      setDlState('idle');
    }
  };

  const streak = dashboard?.streak ?? 0;
  const wordsDueToday = dashboard?.wordsDueToday ?? 0;
  const wordsLearned = dashboard?.wordsLearned ?? 0;
  const totalReviews = dashboard?.totalReviews ?? 0;
  const xp = dashboard?.xp ?? 0;

  const today = new Date();
  const dateStr = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const DAILY_REVIEW_GOAL = 20;
  const hour = today.getHours();
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

  return (
    <div style={styles.screen}>
      <div style={styles.greeting}>{greeting}</div>
      <div style={styles.sub}>{dateStr} · {wordsDueToday > 0 ? `${wordsDueToday} слов ждут повторения` : 'На сегодня всё готово'}</div>

      {/* Streak */}
      <div style={styles.streak}>
        <span style={styles.flame}>🔥</span>
        <span style={styles.streakCount}>{streak}</span>
        <span style={styles.streakLabel}>дней подряд</span>
      </div>

      {/* CTA */}
      <div
        style={styles.ctaCard}
        onClick={() => navigate('/study')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate('/study');
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div style={styles.ctaContent}>
          <div style={styles.ctaLabel}>Начать тренировку</div>
          <div style={styles.ctaSub}>{wordsDueToday > 0 ? `${wordsDueToday} слов на сегодня` : 'Изучать новые слова'}</div>
        </div>
        <div style={styles.ctaArrow}>→</div>
      </div>

      {/* Быстрый запуск нестандартной практики */}
      <div
        style={{ ...styles.modeCard, marginBottom: 12, borderColor: 'var(--border-accent)' }}
        onClick={() => navigate('/study?practice=multiple-choice')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate('/study?practice=multiple-choice');
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div style={styles.modeTitle}>Микс-режимы →</div>
        <div style={styles.modeText}>Выбор перевода · ввод пиньиня · тоны · слоги</div>
      </div>

      <div style={styles.modeGrid}>
        <button style={styles.modeCard} onClick={() => navigate('/study?mode=review')}>
          <div style={styles.modeTitle}>Повторить сегодня</div>
          <div style={styles.modeText}>Карточки с dueDate &lt;= now</div>
        </button>
        <button style={styles.modeCard} onClick={() => navigate('/study?mode=learn')}>
          <div style={styles.modeTitle}>Учить новые</div>
          <div style={styles.modeText}>Только новые слова без повтора</div>
        </button>
        <button style={styles.modeCard} onClick={() => navigate('/study?mode=mixed')}>
          <div style={styles.modeTitle}>Смешанная сессия</div>
          <div style={styles.modeText}>Новые слова + повторение</div>
        </button>
      </div>

      {/* Stats grid */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNumber, color: 'var(--accent)' }}>{wordsLearned}</div>
          <div style={styles.statLabel}>выучено слов</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{totalReviews}</div>
          <div style={styles.statLabel}>повторений</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{xp}</div>
          <div style={styles.statLabel}>опыта (XP)</div>
        </div>
      </div>

      {/* Today's progress ring */}
      <div style={styles.progressSection}>
        <div className="section-label">Прогресс за сегодня</div>
        <div style={styles.progressRow}>
          <CircularProgress value={totalReviews} max={DAILY_REVIEW_GOAL} size={88} strokeWidth={5} />
          <div style={styles.progressInfo}>
            <div style={styles.progressInfoNumber}>{wordsDueToday}</div>
            <div style={styles.progressInfoLabel}>слов к повторению</div>
            {wordsDueToday > 0 && (
              <button style={styles.startSmallBtn} onClick={() => navigate('/study')}>
                Начать →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recent words */}
      {recentWords.length > 0 && (
        <>
          <div className="section-label">Последние слова</div>
          <div style={styles.wordRows}>
            {recentWords.map((w: any) => (
              <div key={w.id} style={styles.wordRow}>
                <div style={styles.wrChar}>{w.character}</div>
                <div style={{ flex: 1 }}>
                  <PinyinDisplay pinyin={w.pinyin} />
                  <div style={styles.wrTranslation}>{w.translation}</div>
                </div>
                <Badge status={w.status ?? 'new'} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Offline download */}
      {isOnline && (
        <button
          onClick={handleDownloadOffline}
          disabled={dlState === 'loading'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
            padding: '10px 16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 10,
            cursor: dlState === 'loading' ? 'default' : 'pointer',
            fontSize: 13,
            width: '100%',
            opacity: dlState === 'done' ? 0.6 : 1,
          }}
        >
          <Download size={16} />
          {dlState === 'idle' && 'Скачать офлайн-пакет'}
          {dlState === 'loading' && 'Загрузка...'}
          {dlState === 'done' && 'Готово'}
        </button>
      )}

      {isLoading && (
        <div style={styles.loading}>
          <span className="spinner" />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    position: 'absolute',
    inset: 0,
    overflowY: 'auto',
    padding: '26px 26px 20px',
  },
  greeting: {
    fontSize: 20,
    fontWeight: 500,
    marginBottom: 3,
  },
  sub: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 14,
  },
  streak: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--tone-3-bg)',
    border: '1px solid rgba(251,191,36,0.2)',
    borderRadius: 20,
    padding: '5px 13px',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--tone-3)',
    marginBottom: 18,
    animation: 'glow-pulse 2s ease-in-out infinite',
  },
  flame: {
    fontSize: 16,
    filter: 'drop-shadow(0 0 6px rgba(255,183,77,0.6))',
  },
  streakCount: {
    fontSize: 14,
    fontWeight: 700,
  },
  streakLabel: {
    opacity: 0.7,
  },
  ctaCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--accent)',
    borderRadius: 14,
    padding: '16px 18px',
    cursor: 'pointer',
    marginBottom: 18,
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  ctaContent: {},
  ctaLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
  },
  ctaSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  ctaArrow: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.7)',
  },
  modeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
    gap: 8,
    marginBottom: 18,
  },
  modeCard: {
    textAlign: 'left',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: '12px 14px',
    cursor: 'pointer',
  },
  modeTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 3,
  },
  modeText: {
    fontSize: 11,
    color: 'var(--text-secondary)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    marginBottom: 18,
  },
  statCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: '12px 8px',
    textAlign: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 600,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: 10,
    color: 'var(--text-muted)',
    marginTop: 4,
  },
  progressSection: {
    marginBottom: 18,
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: 14,
  },
  progressInfo: {
    flex: 1,
  },
  progressInfoNumber: {
    fontSize: 28,
    fontWeight: 600,
    lineHeight: 1,
  },
  progressInfoLabel: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    marginTop: 2,
  },
  startSmallBtn: {
    marginTop: 8,
    padding: '6px 14px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  wordRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  wordRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: '10px 14px',
  },
  wrChar: {
    fontSize: 23,
    width: 32,
    textAlign: 'center',
    fontFamily: 'var(--font-cjk)',
    lineHeight: 1,
  },
  wrTranslation: {
    fontSize: 13,
    marginTop: 2,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: 20,
  },
};
