import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useActivity, useOverview } from '../queries/stats';

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getIntensity(count: number): number {
  if (count === 0) return 0;
  if (count <= 5) return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

const INTENSITY_COLORS = [
  '#1A1F2E',
  'rgba(220,38,38,0.2)',
  'rgba(220,38,38,0.4)',
  'rgba(220,38,38,0.65)',
  'rgba(220,38,38,0.9)',
];

interface TooltipData {
  date: string;
  count: number;
  x: number;
  y: number;
}

function ActivityCalendar({
  activityMap,
  year,
}: {
  activityMap: Map<string, number>;
  year: number;
}) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  return useMemo(() => {
    // Определяем первый день года (0=Пн, 6=Вс)
    const firstDay = new Date(year, 0, 1);
    const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Пн=0
    const daysInYear = (new Date(year, 11, 31).getTime() - firstDay.getTime()) / 86400000 + 1;

    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];

    // Пустые ячейки до первого дня года
    for (let d = 0; d < startDow; d++) {
      currentWeek.push(null);
    }

    for (let dayOfYear = 0; dayOfYear < daysInYear; dayOfYear++) {
      const date = new Date(year, 0, 1 + dayOfYear);
      const dow = date.getDay() === 0 ? 6 : date.getDay() - 1;
      currentWeek.push(dayOfYear + 1);
      if (dow === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    return (
      <div style={{ position: 'relative' }}>
        <div style={styles.calendarGrid}>
          {/* DOW labels */}
          <div style={styles.dowCol}>
            {DOW.map((d) => (
              <span key={d} style={styles.dowLabel}>{d}</span>
            ))}
          </div>
          {/* Week columns */}
          <div style={styles.weekCols}>
            {weeks.map((week, wi) => (
              <div key={wi} style={styles.weekCol}>
                {week.map((dayNum, di) => {
                  if (dayNum === null) return <div key={di} style={styles.cell} />;
                  const dateObj = new Date(year, 0, dayNum);
                  const dateStr = dateObj.toISOString().slice(0, 10);
                  const count = activityMap.get(dateStr) ?? 0;
                  const intensity = getIntensity(count);
                  const isToday = dateStr === todayStr;
                  return (
                    <div
                      key={di}
                      style={{
                        ...styles.cell,
                        background: INTENSITY_COLORS[intensity],
                        border: isToday ? '1px solid var(--accent)' : '1px solid transparent',
                      }}
                      onMouseEnter={(e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setTooltip({
                          date: dateStr,
                          count,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8,
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: 'fixed',
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -100%)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 11,
              color: 'var(--text-primary)',
              pointerEvents: 'none',
              zIndex: 100,
              whiteSpace: 'nowrap',
            }}
          >
            {tooltip.date}: {tooltip.count} повторений
          </div>
        )}
        {/* Legend */}
        <div style={styles.legend}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 4 }}>Меньше</span>
          {INTENSITY_COLORS.map((color, i) => (
            <div key={i} style={{ ...styles.legendCell, background: color }} />
          ))}
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>Больше</span>
        </div>
      </div>
    );
  }, [activityMap, year, tooltip]);
}

export default function StatsScreen() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data: overview } = useOverview();
  const { data: activityData } = useActivity(year);

  const activityMap = useMemo(() => {
    const map = new Map<string, number>();
    if (activityData) {
      for (const d of activityData) {
        map.set(d.date, d.count);
      }
    }
    return map;
  }, [activityData]);

  const totalReviews = activityData?.reduce((sum, d) => sum + d.count, 0) ?? 0;
  const streak = overview?.currentStreak ?? 0;
  const graduated = overview?.byState?.graduated ?? 0;
  const xp = overview?.xp ?? 0;

  return (
    <div style={styles.screen}>
      {/* Summary stats */}
      <div style={styles.statGrid}>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNumber, color: 'var(--tone-3)' }}>{streak}</div>
          <div style={styles.statLabel}>🔥 текущий стрик</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNumber, color: 'var(--accent)' }}>{totalReviews}</div>
          <div style={styles.statLabel}>повторений за {year}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{graduated}</div>
          <div style={styles.statLabel}>слов graduated</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNumber, color: 'var(--tone-2)' }}>{xp}</div>
          <div style={styles.statLabel}>всего XP</div>
        </div>
      </div>

      {/* Activity Calendar */}
      <div style={styles.calSection}>
        <div style={styles.calHeader}>
          <span className="section-label" style={{ margin: 0 }}>Активность</span>
          <div style={styles.yearSwitcher}>
            <button
              style={styles.yearBtn}
              onClick={() => setYear((y) => y - 1)}
              aria-label="Предыдущий год"
            >
              <ChevronLeft size={14} />
            </button>
            <span style={styles.yearLabel}>{year}</span>
            <button
              style={styles.yearBtn}
              onClick={() => setYear((y) => (y < currentYear ? y + 1 : y))}
              disabled={year >= currentYear}
              aria-label="Следующий год"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <ActivityCalendar activityMap={activityMap} year={year} />
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
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18,
  },
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
    borderRadius: 12, padding: 12, textAlign: 'center',
  },
  statNumber: { fontSize: 22, fontWeight: 600, lineHeight: 1 },
  statLabel: { fontSize: 9, color: 'var(--text-muted)', marginTop: 4 },
  calSection: {
    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
    borderRadius: 12, padding: 16,
  },
  calHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  yearSwitcher: {
    display: 'flex', alignItems: 'center', gap: 4,
  },
  yearBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 6,
    background: 'transparent', border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)', cursor: 'pointer',
  },
  yearLabel: {
    fontSize: 13, fontWeight: 500, minWidth: 40, textAlign: 'center',
  },
  calendarGrid: {
    display: 'flex', gap: 3,
  },
  dowCol: {
    display: 'flex', flexDirection: 'column', gap: 3,
  },
  dowLabel: {
    fontSize: 8, color: 'var(--text-dim)', height: 12, lineHeight: '12px', textAlign: 'right',
    paddingRight: 4, width: 20,
  },
  weekCols: {
    display: 'flex', gap: 3, overflowX: 'auto', flex: 1,
  },
  weekCol: {
    display: 'flex', flexDirection: 'column', gap: 3,
  },
  cell: {
    width: 12, height: 12, borderRadius: 3, transition: 'all 0.1s',
  },
  legend: {
    display: 'flex', alignItems: 'center', gap: 3, marginTop: 10,
    justifyContent: 'flex-end',
  },
  legendCell: {
    width: 10, height: 10, borderRadius: 2,
  },
};
