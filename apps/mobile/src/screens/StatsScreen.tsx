import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../bootstrap';
import { buildYearGrid } from '../utils/yearGrid';

interface DashboardData {
  xp: number;
  currentStreak: number;
  totalReviews: number;
  wordsLearned: number;
  wordsDueToday: number;
  dailyGoal: number;
  todayReviews: number;
}

interface ActivityDay {
  date: string;
  count: number;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  xp: number;
  currentStreak: number;
  isCurrentUser: boolean;
}

interface LeaderboardResponse {
  period: 'week' | 'all';
  total: number;
  entries: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
}

/** F22b: интенсивность ячейки heatmap по числу ответов. */
function cellColor(count: number): string {
  if (count <= 0) return '#161B26';
  if (count === 1) return 'rgba(79,195,247,0.25)';
  if (count <= 3) return 'rgba(79,195,247,0.45)';
  if (count <= 6) return 'rgba(79,195,247,0.7)';
  return '#4FC3F7';
}

export function StatsScreen(): React.ReactElement {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [activityMap, setActivityMap] = useState<Map<string, number>>(new Map());
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [period, setPeriod] = useState<'week' | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  const year = new Date().getFullYear();

  useEffect(() => {
    const load = async () => {
      const dashResult = await api.get<DashboardData>('/stats/dashboard');
      if (!dashResult.ok) {
        setError(dashResult.message);
        return;
      }
      const activityResult = await api.get<ActivityDay[]>(`/stats/activity?year=${year}`);
      if (!activityResult.ok) {
        setError(activityResult.message);
        return;
      }
      const boardResult = await api.get<LeaderboardResponse>(
        `/stats/leaderboard?period=${period}&limit=50`,
      );
      if (!boardResult.ok) {
        setError(boardResult.message);
        return;
      }
      setDashboard(dashResult.data);
      setActivityMap(new Map(activityResult.data.map((d) => [d.date, d.count])));
      setLeaderboard(boardResult.data);
      setError(null);
    };
    void load();
  }, [period, year]);

  const weeks = useMemo(() => buildYearGrid(year), [year]);

  const today = dashboard?.todayReviews ?? 0;
  const goal = dashboard?.dailyGoal ?? 0;
  const goalPct = goal > 0 ? Math.min(100, Math.round((today / goal) * 100)) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Статистика</Text>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !dashboard || !leaderboard ? (
        <View style={styles.center}>
          <ActivityIndicator color="#4FC3F7" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {/* F22b: дашборд */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Сводка</Text>
            <View style={styles.grid}>
              <View style={styles.tile}>
                <Text style={styles.tileValue}>{dashboard.xp}</Text>
                <Text style={styles.tileLabel}>XP</Text>
              </View>
              <View style={styles.tile}>
                <Text style={styles.tileValue}>{dashboard.currentStreak}</Text>
                <Text style={styles.tileLabel}>дней подряд</Text>
              </View>
              <View style={styles.tile}>
                <Text style={styles.tileValue}>{dashboard.wordsLearned}</Text>
                <Text style={styles.tileLabel}>слов выучено</Text>
              </View>
              <View style={styles.tile}>
                <Text style={styles.tileValue}>{dashboard.totalReviews}</Text>
                <Text style={styles.tileLabel}>повторений</Text>
              </View>
            </View>
            <View style={styles.goalRow}>
              <View style={styles.goalTrack}>
                <View style={[styles.goalFill, { width: `${goalPct}%` }]} />
              </View>
              <Text style={styles.goalText}>
                Сегодня {today} / {goal} · к повторению {dashboard.wordsDueToday}
              </Text>
            </View>
          </View>

          {/* F22b: активность (heatmap года) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Активность · {year}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.heatmapRow}>
                {weeks.map((week, wi) => (
                  <View key={wi} style={styles.heatmapCol}>
                    {week.map((date, di) => (
                      <View
                        key={di}
                        style={[
                          styles.heatCell,
                          {
                            backgroundColor: date
                              ? cellColor(activityMap.get(date) ?? 0)
                              : 'transparent',
                          },
                        ]}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Лидерборд */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Лидерборд</Text>
            <View style={styles.tabs}>
              <Pressable
                style={[styles.tab, period === 'week' && styles.tabActive]}
                onPress={() => setPeriod('week')}
              >
                <Text style={[styles.tabText, period === 'week' && styles.tabTextActive]}>
                  Неделя
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, period === 'all' && styles.tabActive]}
                onPress={() => setPeriod('all')}
              >
                <Text style={[styles.tabText, period === 'all' && styles.tabTextActive]}>
                  Всё время
                </Text>
              </Pressable>
            </View>
            {leaderboard.entries.map((e) => (
              <View key={e.userId} style={[styles.row, e.isCurrentUser && styles.rowCurrent]}>
                <Text
                  style={[
                    styles.rank,
                    e.rank === 1 && styles.rankGold,
                    e.rank === 2 && styles.rankSilver,
                    e.rank === 3 && styles.rankBronze,
                  ]}
                >
                  #{e.rank}
                </Text>
                <Text style={styles.name}>{e.displayName}</Text>
                <Text style={styles.xp}>{e.xp} XP</Text>
                <Text style={styles.streak}>🔥 {e.currentStreak}</Text>
              </View>
            ))}
            {leaderboard.currentUser &&
            !leaderboard.entries.find((e) => e.userId === leaderboard.currentUser!.userId) ? (
              <>
                <View style={styles.divider} />
                <View style={[styles.row, styles.rowCurrent]}>
                  <Text style={styles.rank}>#{leaderboard.currentUser.rank}</Text>
                  <Text style={styles.name}>{leaderboard.currentUser.displayName} (вы)</Text>
                  <Text style={styles.xp}>{leaderboard.currentUser.xp} XP</Text>
                  <Text style={styles.streak}>🔥 {leaderboard.currentUser.currentStreak}</Text>
                </View>
              </>
            ) : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0C0E16',
  },
  title: {
    color: '#E8EAED',
    fontSize: 28,
    fontWeight: '700',
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#E57373',
    fontSize: 14,
  },
  list: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: '#7B8497',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  tile: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  tileValue: {
    color: '#E8EAED',
    fontSize: 24,
    fontWeight: '700',
    backgroundColor: '#141820',
    borderRadius: 12,
    paddingVertical: 14,
    textAlign: 'center',
  },
  tileLabel: {
    color: '#7B8497',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  goalRow: {
    marginTop: 12,
  },
  goalTrack: {
    height: 8,
    backgroundColor: '#1E2330',
    borderRadius: 4,
    overflow: 'hidden',
  },
  goalFill: {
    height: '100%',
    backgroundColor: '#4FC3F7',
  },
  goalText: {
    color: '#7B8497',
    fontSize: 13,
    marginTop: 8,
  },
  heatmapRow: {
    flexDirection: 'row',
    gap: 2,
  },
  heatmapCol: {
    gap: 2,
  },
  heatCell: {
    width: 6,
    height: 6,
    borderRadius: 1.5,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#141820',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#1E2330',
  },
  tabText: {
    color: '#7B8497',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#E8EAED',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141820',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowCurrent: {
    borderWidth: 1,
    borderColor: '#4FC3F7',
  },
  rank: {
    color: '#7B8497',
    fontSize: 14,
    fontWeight: '600',
    width: 48,
  },
  rankGold: { color: '#FFB74D' },
  rankSilver: { color: '#B0BEC5' },
  rankBronze: { color: '#A1887F' },
  name: {
    color: '#E8EAED',
    fontSize: 15,
    flex: 1,
  },
  xp: {
    color: '#4FC3F7',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 12,
  },
  streak: {
    color: '#FFB74D',
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E2330',
    marginVertical: 8,
  },
});
