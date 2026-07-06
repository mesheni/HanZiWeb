import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../bootstrap';

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

export function StatsScreen(): React.ReactElement {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [period, setPeriod] = useState<'week' | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const result = await api.get<LeaderboardResponse>(
        `/stats/leaderboard?period=${period}&limit=50`,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setData(result.data);
    };
    void load();
  }, [period]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Статистика</Text>

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

      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !data ? (
        <View style={styles.center}>
          <ActivityIndicator color="#4FC3F7" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {data.entries.map((e) => (
            <View
              key={e.userId}
              style={[styles.row, e.isCurrentUser && styles.rowCurrent]}
            >
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
          {data.currentUser &&
          !data.entries.find((e) => e.userId === data.currentUser!.userId) ? (
            <>
              <View style={styles.divider} />
              <View style={[styles.row, styles.rowCurrent]}>
                <Text style={styles.rank}>#{data.currentUser.rank}</Text>
                <Text style={styles.name}>{data.currentUser.displayName} (вы)</Text>
                <Text style={styles.xp}>{data.currentUser.xp} XP</Text>
                <Text style={styles.streak}>🔥 {data.currentUser.currentStreak}</Text>
              </View>
            </>
          ) : null}
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#141820',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
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
