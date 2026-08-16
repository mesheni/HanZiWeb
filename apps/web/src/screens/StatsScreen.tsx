import { cloneElement, useMemo, useState } from 'react';
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
  Rocket,
  Star,
  Target,
  Zap,
  Sun,
  Moon,
  Heart,
  Sword,
  Shield,
  Medal,
  Gem,
  Diamond,
} from 'lucide-react';
import { ActivityCalendar } from 'react-activity-calendar';
import 'react-activity-calendar/tooltips.css';
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
import { useTheme } from '@/ui/useTheme';
import {
  buildActivityCalendar,
  formatActivityCount,
  formatCalendarDateKey,
  formatCalendarDateLabel,
  type ActivityDayInput,
} from '../utils/activityCalendar';

const ACHIEVEMENT_ICONS: Record<AchievementType, typeof Flame> = {
  first_review: Star,
  streak_7: Flame,
  streak_30: Sword,
  streak_100: Shield,
  words_100: BookCheck,
  words_500: Target,
  words_1000: Rocket,
  hsk1_complete: GraduationCap,
  hsk2_complete: Medal,
  hsk3_complete: Trophy,
  reviews_1k: Zap,
  reviews_10k: Trophy,
  reviews_50k: Crown,
  speed_demon: Zap,
  early_bird: Sun,
  night_owl: Moon,
  perfect_session: Sparkles,
  perfect_5: Heart,
  xp_1000: Gem,
  xp_5000: Diamond,
  xp_10000: Crown,
};

const CAL_MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const CAL_WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const CAL_COLORS: string[] = [
  'var(--cal-empty)',
  'var(--cal-level-1)',
  'var(--cal-level-2)',
  'var(--cal-level-3)',
  'var(--cal-level-4)',
];

function levelRangeLabel(level: number): string {
  if (level <= 0) return '0';
  if (level <= 1) return '1-5';
  if (level <= 2) return '6-15';
  if (level <= 3) return '16-30';
  return '31+';
}

function StatsActivityCalendar({
  activityData,
  year,
}: {
  activityData: ActivityDayInput[];
  year: number;
}) {
  const { theme } = useTheme();
  const data = useMemo(() => buildActivityCalendar(activityData, year), [activityData, year]);
  const todayKey = useMemo(() => formatCalendarDateKey(new Date()), []);

  return (
    <div className="stats-activity-calendar">
      <ActivityCalendar
        data={data}
        weekStart={1}
        colorScheme={theme}
        showMonthLabels
        showWeekdayLabels
        showColorLegend
        showTotalCount={false}
        blockSize={12}
        blockMargin={4}
        blockRadius={3}
        fontSize={12}
        labels={{
          months: CAL_MONTHS,
          weekdays: CAL_WEEKDAYS,
          legend: { less: 'Меньше', more: 'Больше' },
        }}
        theme={{ light: CAL_COLORS, dark: CAL_COLORS }}
        tooltips={{
          activity: {
            text: (activity) =>
              `${formatCalendarDateLabel(activity.date)} · ${formatActivityCount(activity.count)}`,
          },
          colorLegend: {
            text: (level) => `${levelRangeLabel(level)} повторений`,
          },
        }}
        renderBlock={(block, activity) =>
          cloneElement(block, {
            'aria-label': `${formatCalendarDateLabel(activity.date)}: ${formatActivityCount(activity.count)}`,
            style:
              activity.date === todayKey
                ? { ...block.props.style, stroke: 'var(--accent)', strokeWidth: 2 }
                : block.props.style,
          })
        }
      />
    </div>
  );
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
        <StatsActivityCalendar activityData={activityData ?? []} year={year} />
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
