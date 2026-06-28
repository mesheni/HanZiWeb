import { useMemo } from 'react';

/** Демо-статистика */
const STATS = {
  streak: 14,
  totalWords: 248,
  accuracy: 84,
};

/** Дни активности для календаря (июнь 2026) — номера дней, когда были занятия */
const ACTIVE_DAYS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]);

const TOPICS = [
  { name: 'HSK 1', accuracy: 92 },
  { name: 'HSK 2', accuracy: 76 },
  { name: 'Еда', accuracy: 88 },
  { name: 'Числа', accuracy: 95 },
  { name: 'Транспорт', accuracy: 61 },
];

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function StatsScreen() {
  const today = 28;
  const daysInMonth = 30;
  // Июнь 2026 начинается с понедельника (смещение: 0 пустых ячеек перед 1 числом)
  const startOffset = 0;

  const calendarDays = useMemo(() => {
    const cells: { day: number | null; isToday: boolean; isActive: boolean }[] = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({ day: null, isToday: false, isActive: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, isToday: d === today, isActive: ACTIVE_DAYS.has(d) });
    }
    return cells;
  }, []);

  return (
    <div style={styles.screen}>
      {/* Stat cards */}
      <div style={styles.statGrid}>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNumber, color: 'var(--accent)' }}>{STATS.streak}</div>
          <div style={styles.statLabel}>🔥 дней подряд</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{STATS.totalWords}</div>
          <div style={styles.statLabel}>слов изучено</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNumber, color: 'var(--tone-2)' }}>{STATS.accuracy}%</div>
          <div style={styles.statLabel}>точность</div>
        </div>
      </div>

      {/* Calendar */}
      <div className="section-label" style={{ marginBottom: 8 }}>Активность · Июнь 2026</div>
      <div style={styles.calWrap}>
        <div style={styles.dowRow}>
          {DOW.map((d) => <span key={d} style={styles.dowCell}>{d}</span>)}
        </div>
        <div style={styles.calGrid}>
          {calendarDays.map((cell, i) => (
            <div
              key={i}
              style={{
                ...styles.calCell,
                background: cell.day === null
                  ? 'transparent'
                  : cell.isToday
                    ? 'var(--accent)'
                    : cell.isActive
                      ? 'rgba(220,38,38,0.38)'
                      : 'rgba(255,255,255,0.04)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Topic accuracy */}
      <div className="section-label" style={{ marginBottom: 8 }}>Точность по темам</div>
      <div style={styles.accuracyWrap}>
        {TOPICS.map((t) => {
          const color = t.accuracy >= 85 ? 'var(--tone-2)' : t.accuracy >= 70 ? 'var(--tone-3)' : 'var(--tone-4)';
          return (
            <div key={t.name} style={styles.accuracyRow}>
              <span style={styles.accLabel}>{t.name}</span>
              <div style={styles.accBar}>
                <div style={{ ...styles.accFill, width: `${t.accuracy}%`, background: color }} />
              </div>
              <span style={{ ...styles.accPercent, color }}>{t.accuracy}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    position: 'absolute', inset: 0, overflowY: 'auto',
    padding: '26px 26px 20px',
  },
  statGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16,
  },
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
    borderRadius: 12, padding: 13, textAlign: 'center',
  },
  statNumber: { fontSize: 28, fontWeight: 600, lineHeight: 1 },
  statLabel: { fontSize: 10, color: 'var(--text-muted)', marginTop: 4 },
  calWrap: {
    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  dowRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 },
  dowCell: { fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' },
  calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 },
  calCell: { aspectRatio: '1', borderRadius: 3 },
  accuracyWrap: {
    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
    borderRadius: 12, padding: 14,
  },
  accuracyRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 },
  accLabel: { fontSize: 11, color: '#55576B', width: 76 },
  accBar: { flex: 1, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' },
  accFill: { height: '100%', borderRadius: 3 },
  accPercent: { fontSize: 11, fontWeight: 500, width: 30, textAlign: 'right' as const },
};
