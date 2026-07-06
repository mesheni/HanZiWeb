import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore, api, getSync } from '../bootstrap';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface DashboardData {
  xp: number;
  currentStreak: number;
  totalReviews: number;
  wordsLearned: number;
  wordsDueToday: number;
  dailyGoal: number;
  todayReviews: number;
}

export function HomeScreen(): React.ReactElement {
  const navigation = useNavigation<Nav>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    const result = await api.get<DashboardData>('/stats/dashboard');
    if (!result.ok) {
      setError(result.message);
    } else {
      setData(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadDashboard();
    void getSync()
      .pendingCount()
      .then(setPendingCount);
  }, []);

  const progress = data
    ? Math.min(1, data.todayReviews / Math.max(1, data.dailyGoal))
    : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.greeting}>
            Привет{getGreetingSuffix(useAuthStore.getState().user?.email)}
          </Text>
          <Pressable
            onPress={() => {
              useAuthStore.getState().logout();
            }}
            hitSlop={12}
          >
            <Text style={styles.logout}>Выйти</Text>
          </Pressable>
        </View>

        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator color="#4FC3F7" size="large" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retry} onPress={loadDashboard}>
              <Text style={styles.retryText}>Повторить</Text>
            </Pressable>
          </View>
        ) : data ? (
          <>
            {/* Streak card */}
            <View style={styles.streakCard}>
              <Text style={styles.streakNumber}>{data.currentStreak}</Text>
              <Text style={styles.streakLabel}>дней подряд</Text>
            </View>

            {/* Daily progress */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Прогресс за сегодня</Text>
                <Text style={styles.cardSubtitle}>
                  {data.todayReviews} / {data.dailyGoal}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(progress * 100)}%` },
                  ]}
                />
              </View>
              {data.todayReviews >= data.dailyGoal ? (
                <Text style={styles.goalReached}>✓ Цель на сегодня достигнута</Text>
              ) : null}
            </View>

            {/* Stats grid */}
            <View style={styles.grid}>
              <StatTile label="XP" value={data.xp} />
              <StatTile label="Слов выучено" value={data.wordsLearned} />
              <StatTile label="Повторений" value={data.totalReviews} />
              <StatTile label="К повторению" value={data.wordsDueToday} />
            </View>

            {pendingCount > 0 ? (
              <View style={styles.syncCard}>
                <Text style={styles.syncText}>
                  В очереди синхронизации: {pendingCount}
                </Text>
                <Text style={styles.syncHint}>
                  Синхронизируется автоматически при появлении сети.
                </Text>
              </View>
            ) : null}

            <Pressable
              style={styles.startButton}
              onPress={() => navigation.navigate('Study')}
            >
              <Text style={styles.startButtonText}>Начать тренировку</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function getGreetingSuffix(email?: string): string {
  if (!email) return '!';
  const local = email.split('@')[0] ?? '';
  return local ? `, ${local}` : '!';
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0C0E16',
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: {
    color: '#E8EAED',
    fontSize: 22,
    fontWeight: '600',
    flex: 1,
  },
  logout: {
    color: '#7B8497',
    fontSize: 14,
  },
  center: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  error: {
    color: '#E57373',
    fontSize: 15,
    marginBottom: 16,
  },
  retry: {
    backgroundColor: '#1E2330',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: '#4FC3F7',
    fontSize: 14,
    fontWeight: '500',
  },
  streakCard: {
    backgroundColor: '#1E2330',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  streakNumber: {
    color: '#FFB74D',
    fontSize: 56,
    fontWeight: '700',
  },
  streakLabel: {
    color: '#7B8497',
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#141820',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#E8EAED',
    fontSize: 16,
    fontWeight: '600',
  },
  cardSubtitle: {
    color: '#7B8497',
    fontSize: 14,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#1E2330',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4FC3F7',
  },
  goalReached: {
    color: '#81C784',
    fontSize: 13,
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 12,
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
    paddingVertical: 16,
    textAlign: 'center',
  },
  tileLabel: {
    color: '#7B8497',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  syncCard: {
    backgroundColor: '#1E2330',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  syncText: {
    color: '#FFB74D',
    fontSize: 14,
    fontWeight: '500',
  },
  syncHint: {
    color: '#7B8497',
    fontSize: 12,
    marginTop: 4,
  },
  startButton: {
    backgroundColor: '#4FC3F7',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  startButtonText: {
    color: '#0C0E16',
    fontSize: 18,
    fontWeight: '700',
  },
});
