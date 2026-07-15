import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Flame,
  BookCheck,
  GraduationCap,
  Loader2,
  Lock,
  Map as MapIcon,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  useActivity,
  useLeaderboard,
  useOverview,
  useStudyMap,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from '../queries/stats';
import { useAchievements } from '../queries/achievements';
import StudyMapCard from '../components/StudyMapCard';
import { ACHIEVEMENT_CATALOG, type AchievementType } from '@hanzi/shared';
import { cn } from '../utils/cn';

const ACHIEVEMENT_ICONS: Record<AchievementType, typeof Flame> = {
  streak_7: Flame,
  words_100: BookCheck,
  hsk1_complete: GraduationCap,
  reviews_10k: Trophy,
  perfect_session: Sparkles,
};

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function getIntensity(count: number): number {
  if (count === 0) return 0;
  if (count <= 5) return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

const INTENSITY_COLORS = [
  'var(--cal-empty)',
  'var(--cal-level-1)',
  'var(--cal-level-2)',
  'var(--cal-level-3)',
  'var(--cal-level-4)',
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

    const monthStartMap = new Map<number, number>();
    for (let month = 0; month < 12; month++) {
      const date = new Date(year, month, 1);
      const dayOfYear = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
      const weekIdx = Math.floor((dayOfYear + startDow) / 7);
      monthStartMap.set(weekIdx, month);
    }

    const getWeekMonth = (week: (number | null)[]): number => {
      for (const dayNum of week) {
        if (dayNum !== null) {
          return new Date(year, 0, dayNum).getMonth();
        }
      }
      return 0;
    };

    return (
      <div className="activity-calendar">
        <div className="activity-calendar-scroll">
          <div className="activity-calendar-layout">
            {/* Month labels */}
            <div className="activity-calendar-month-header">
              <div className="activity-calendar-month-header-spacer" />
              <div className="activity-calendar-month-cols">
                {weeks.map((_, wi) => {
                  const month = monthStartMap.get(wi);
                  const isMonthStart = month !== undefined;
                  return (
                    <div
                      key={wi}
                      className={cn(
                        'activity-calendar-month-col',
                        isMonthStart && wi > 0 ? 'activity-calendar-month-col-start' : undefined,
                      )}
                    >
                      {isMonthStart && (
                        <span className="activity-calendar-month-label">{MONTHS[month]}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="activity-calendar-grid">
              {/* DOW labels */}
              <div className="activity-calendar-dow-col">
                {DOW.map((d) => (
                  <span key={d} className="activity-calendar-dow-label">
                    {d}
                  </span>
                ))}
              </div>
              {/* Week columns */}
              <div className="activity-calendar-week-cols">
                {weeks.map((week, wi) => {
                  const weekMonth = getWeekMonth(week);
                  const isMonthStart = monthStartMap.has(wi);
                  return (
                    <div
                      key={wi}
                      className={cn(
                        'activity-calendar-week-col',
                        weekMonth % 2 === 1 ? 'activity-calendar-week-col-odd' : undefined,
                        isMonthStart && wi > 0
                          ? 'activity-calendar-week-col-month-start'
                          : undefined,
                      )}
                    >
                      {week.map((dayNum, di) => {
                        if (dayNum === null) {
                          return (
                            <div
                              key={di}
                              className="activity-calendar-cell"
                              style={{ background: INTENSITY_COLORS[0] }}
                            />
                          );
                        }
                        const dateObj = new Date(year, 0, dayNum);
                        const dateStr = dateObj.toISOString().slice(0, 10);
                        const count = activityMap.get(dateStr) ?? 0;
                        const intensity = getIntensity(count);
                        const isToday = dateStr === todayStr;
                        return (
                          <div
                            key={di}
                            role="button"
                            tabIndex={0}
                            aria-label={`${dateStr}: ${count} повторений`}
                            className={cn(
                              'activity-calendar-cell',
                              isToday ? 'activity-calendar-cell-today' : undefined,
                            )}
                            style={{ background: INTENSITY_COLORS[intensity] }}
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
                            onClick={(e) => {
                              const rect = (e.target as HTMLElement).getBoundingClientRect();
                              setTooltip((prev) =>
                                prev?.date === dateStr
                                  ? null
                                  : {
                                      date: dateStr,
                                      count,
                                      x: rect.left + rect.width / 2,
                                      y: rect.top - 8,
                                    },
                              );
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                setTooltip((prev) =>
                                  prev?.date === dateStr
                                    ? null
                                    : {
                                        date: dateStr,
                                        count,
                                        x: rect.left + rect.width / 2,
                                        y: rect.top - 8,
                                      },
                                );
                              }
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {/* Tooltip */}
        {tooltip && (
          <div className="activity-calendar-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            {tooltip.date}: {tooltip.count} повторений
          </div>
        )}
        {/* Legend */}
        <div className="activity-calendar-legend">
          <span className="activity-calendar-legend-label">Меньше</span>
          {INTENSITY_COLORS.map((color, i) => (
            <div key={i} className="activity-calendar-legend-cell" style={{ background: color }} />
          ))}
          <span className="activity-calendar-legend-label">Больше</span>
        </div>
      </div>
    );
  }, [activityMap, year, tooltip]);
}

function LeaderboardRow({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  const rankClass =
    entry.rank === 1
      ? 'rank-gold'
      : entry.rank === 2
        ? 'rank-silver'
        : entry.rank === 3
          ? 'rank-bronze'
          : 'rank-default';
  return (
    <div className={`lb-row${isMe ? ' lb-row-me' : ''}`}>
      <div className={`lb-rank ${rankClass}`}>
        {entry.rank === 1 ? <Crown size={12} /> : `#${entry.rank}`}
      </div>
      <div className="lb-name">
        {entry.displayName}
        {isMe && <span className="lb-me-badge">вы</span>}
      </div>
      <div className="lb-xp">{entry.xp} XP</div>
      <div className="lb-streak">🔥 {entry.currentStreak}</div>
    </div>
  );
}

function Leaderboard({
  entries,
  currentUser,
  isLoading,
  isError,
}: {
  entries: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <div className="lb-loading">
        <Loader2 size={16} className="spinner-inline" />
      </div>
    );
  }
  if (isError) {
    return <div className="lb-empty">Не удалось загрузить таблицу лидеров.</div>;
  }
  if (entries.length === 0 && !currentUser) {
    return (
      <div className="lb-empty">
        <Trophy size={14} />
        <span>За эту неделю ещё никто не заработал XP. Будь первым!</span>
      </div>
    );
  }
  const meInTop = entries.some((e) => e.isCurrentUser);
  return (
    <div className="lb-list">
      {entries.map((e) => (
        <LeaderboardRow key={e.userId} entry={e} isMe={e.isCurrentUser} />
      ))}
      {currentUser && !meInTop && (
        <>
          <div className="lb-divider" aria-hidden="true">
            · · ·
          </div>
          <LeaderboardRow entry={currentUser} isMe />
        </>
      )}
    </div>
  );
}

function Achievements() {
  const { data, isLoading, isError } = useAchievements();

  const unlockedMap = useMemo(() => {
    const map = new Map<AchievementType, string>();
    if (data?.achievements) {
      for (const a of data.achievements) {
        map.set(a.type as AchievementType, a.unlockedAt);
      }
    }
    return map;
  }, [data]);

  const unlockedCount = unlockedMap.size;
  const totalCount = ACHIEVEMENT_CATALOG.length;

  if (isLoading) {
    return (
      <div className="lb-loading">
        <Loader2 size={16} className="spinner-inline" />
      </div>
    );
  }
  if (isError) {
    return <div className="ach-empty">Не удалось загрузить достижения.</div>;
  }

  return (
    <>
      <div className="ach-progress">
        <span className="ach-progress-text">
          {unlockedCount} / {totalCount}
        </span>
        <div className="ach-progress-bar">
          <div
            className="ach-progress-fill"
            style={{ width: `${(unlockedCount / totalCount) * 100}%` }}
          />
        </div>
      </div>
      <div className="ach-grid">
        {ACHIEVEMENT_CATALOG.map((meta) => {
          const isUnlocked = unlockedMap.has(meta.type);
          const Icon = ACHIEVEMENT_ICONS[meta.type];
          return (
            <div
              key={meta.type}
              className={`ach-card${isUnlocked ? ' ach-card-unlocked' : ' ach-card-locked'}`}
              title={meta.description}
            >
              <div className="ach-card-icon">
                {isUnlocked ? <Icon size={20} /> : <Lock size={20} />}
              </div>
              <div className="ach-card-title">{meta.title}</div>
              <div className="ach-card-desc">{meta.description}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function StatsScreen() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const navigate = useNavigate();

  const { data: overview } = useOverview();
  const { data: activityData } = useActivity(year);
  const { data: leaderboard, isLoading: lbLoading, isError: lbError } = useLeaderboard(period);
  const { data: studyMap, isLoading: smLoading, isError: smError } = useStudyMap();

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

  const handleDeckClick = (deckId: string) => {
    navigate(`/library?deckId=${encodeURIComponent(deckId)}`);
  };

  return (
    <div className="stats-screen">
      {/* Summary stats */}
      <div className="stats-summary-grid">
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
      <div className="stats-section">
        <div className="stats-section-header">
          <span className="section-label">Активность</span>
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

      {/* Study Map (PLAN_Features_v0.3 §5) */}
      <div className="stats-section">
        <div className="stats-section-header">
          <span className="section-label">Карта изучения</span>
          {studyMap && studyMap.totalWords > 0 && (
            <span className="study-map-overall">
              {studyMap.totalLearned} / {studyMap.totalWords} · {studyMap.overallPercentage}%
            </span>
          )}
        </div>
        {smLoading ? (
          <div className="lb-loading">
            <Loader2 size={16} className="spinner-inline" />
          </div>
        ) : smError ? (
          <div className="lb-empty">Не удалось загрузить карту изучения.</div>
        ) : !studyMap || studyMap.decks.length === 0 ? (
          <div className="lb-empty">
            <MapIcon size={14} />
            <span>Пока нет колод. Создайте свою или подпишитесь по коду.</span>
          </div>
        ) : (
          <div className="study-map-grid">
            {studyMap.decks.map((deck) => (
              <StudyMapCard key={deck.deckId} deck={deck} onClick={handleDeckClick} />
            ))}
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="stats-section">
        <div className="stats-section-header">
          <span className="section-label">Таблица лидеров</span>
          <div className="lb-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={period === 'week'}
              className={`lb-tab${period === 'week' ? ' lb-tab-active' : ''}`}
              onClick={() => setPeriod('week')}
            >
              Неделя
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={period === 'all'}
              className={`lb-tab${period === 'all' ? ' lb-tab-active' : ''}`}
              onClick={() => setPeriod('all')}
            >
              Всё время
            </button>
          </div>
        </div>
        <Leaderboard
          entries={leaderboard?.entries ?? []}
          currentUser={leaderboard?.currentUser ?? null}
          isLoading={lbLoading}
          isError={lbError}
        />
      </div>

      {/* Achievements */}
      <div className="stats-section">
        <div className="stats-section-header">
          <span className="section-label">Достижения</span>
        </div>
        <Achievements />
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  statCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: 12,
    textAlign: 'center',
  },
  statNumber: { fontSize: 22, fontWeight: 600, lineHeight: 1 },
  statLabel: { fontSize: 9, color: 'var(--text-muted)', marginTop: 4 },
  yearSwitcher: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  yearBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 6,
    background: 'transparent',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  yearLabel: {
    fontSize: 13,
    fontWeight: 500,
    minWidth: 40,
    textAlign: 'center',
  },
};
