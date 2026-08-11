import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, useAuthStore, getSync } from '../bootstrap';
import { getDatabase } from '../db/database';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

/** F22c: настройки — дневная цель, таймзона, сброс прогресса, выход. */
export function SettingsScreen(): React.ReactElement {
  const navigation = useNavigation<Nav>();
  const [dailyGoal, setDailyGoal] = useState<string>('');
  const [timezone, setTimezone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const result = await api.get<{ dailyGoal: number; timezone: string | null }>(
        '/users/settings',
      );
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDailyGoal(String(result.data.dailyGoal));
      setTimezone(result.data.timezone);
      setError(null);
    };
    void load();
  }, []);

  const saveDailyGoal = async () => {
    const goal = Number(dailyGoal);
    if (!Number.isInteger(goal) || goal < 1 || goal > 200) {
      Alert.alert('Ошибка', 'Цель — целое число от 1 до 200.');
      return;
    }
    setSaving(true);
    const result = await api.put<{ dailyGoal: number }>('/users/settings', { dailyGoal: goal });
    setSaving(false);
    if (!result.ok) {
      Alert.alert('Ошибка', result.message);
      return;
    }
    Alert.alert('Готово', 'Цель сохранена.');
  };

  const syncTimezone = async () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    setSaving(true);
    const result = await api.put<{ timezone: string }>('/users/settings', { timezone: zone });
    setSaving(false);
    if (!result.ok) {
      Alert.alert('Ошибка', result.message);
      return;
    }
    setTimezone(zone);
  };

  const resetProgress = () => {
    Alert.alert(
      'Сбросить прогресс?',
      'Будут удалены все повторения, XP и достижения. Действие необратимо.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSaving(true);
              const result = await api.post('/stats/reset-progress', {});
              if (result.ok) {
                // F16: сброс стирает и локальное зеркало прогресса —
                // иначе офлайн-сессия покажет устаревшие due-слова.
                const db = await getDatabase();
                await db.write(async () => {
                  const progress = await db.get('progress').query().fetch();
                  await Promise.all(progress.map((r) => r.destroyPermanently()));
                  const pending = await db.get('pending_changes').query().fetch();
                  await Promise.all(pending.map((r) => r.destroyPermanently()));
                });
                getSync()
                  .clearLocalState()
                  .catch(() => {});
                Alert.alert('Готово', 'Прогресс сброшен.');
              } else {
                Alert.alert('Ошибка', result.message);
              }
              setSaving(false);
            })();
          },
        },
      ],
    );
  };

  const logout = () => {
    useAuthStore.getState().logout();
  };

  // F28c: полное удаление аккаунта. Локальное состояние чистит
  // onLogout-хук createAuthStore (clearLocalState).
  const deleteAccount = () => {
    Alert.alert(
      'Удалить аккаунт?',
      'Прогресс, сессии, достижения и устройства будут удалены безвозвратно.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSaving(true);
              const result = await api.delete('/auth/account');
              if (result.ok) {
                useAuthStore.getState().logout();
              } else {
                Alert.alert('Ошибка', result.message);
              }
              setSaving(false);
            })();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Настройки</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#4FC3F7" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionLabel}>Дневная цель (карточек)</Text>
          <View style={styles.goalRow}>
            <TextInput
              style={styles.input}
              value={dailyGoal}
              onChangeText={setDailyGoal}
              keyboardType="number-pad"
              placeholder="20"
              placeholderTextColor="#4A5161"
            />
            <Pressable
              style={[styles.primaryBtn, (saving || !dailyGoal) && styles.disabled]}
              onPress={() => void saveDailyGoal()}
              disabled={saving || !dailyGoal}
            >
              <Text style={styles.primaryBtnText}>{saving ? '…' : 'Сохранить'}</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Часовой пояс</Text>
          <View style={styles.goalRow}>
            <Text style={styles.timezoneText}>{timezone ?? 'UTC (не задан)'}</Text>
            <Pressable
              style={[styles.primaryBtn, saving && styles.disabled]}
              onPress={() => void syncTimezone()}
              disabled={saving}
            >
              <Text style={styles.primaryBtnText}>С устройства</Text>
            </Pressable>
          </View>
          <Text style={styles.smallHint}>
            Нужен для корректного стрика и heatmap (время ответа считается в вашей зоне).
          </Text>

          <Text style={styles.sectionLabel}>Опасная зона</Text>
          <Pressable
            style={[styles.dangerBtn, saving && styles.disabled]}
            onPress={resetProgress}
            disabled={saving}
          >
            <Text style={styles.dangerBtnText}>Сбросить весь прогресс</Text>
          </Pressable>

          <Pressable
            style={[styles.deleteAccountBtn, saving && styles.disabled]}
            onPress={deleteAccount}
            disabled={saving}
          >
            <Text style={styles.dangerBtnText}>Удалить аккаунт</Text>
          </Pressable>

          <Pressable style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Выйти</Text>
          </Pressable>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  back: {
    color: '#4FC3F7',
    fontSize: 22,
    width: 28,
  },
  title: {
    color: '#E8EAED',
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 28,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 20,
    paddingTop: 8,
  },
  error: {
    color: '#E57373',
    fontSize: 14,
    marginBottom: 12,
  },
  sectionLabel: {
    color: '#7B8497',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 10,
  },
  goalRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#1E2330',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#E8EAED',
    fontSize: 16,
  },
  timezoneText: {
    flex: 1,
    color: '#E8EAED',
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#4FC3F7',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    color: '#0C0E16',
    fontSize: 14,
    fontWeight: '700',
  },
  smallHint: {
    color: '#4A5161',
    fontSize: 12,
    marginTop: 8,
  },
  dangerBtn: {
    backgroundColor: 'rgba(229,115,115,0.12)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E57373',
  },
  deleteAccountBtn: {
    backgroundColor: 'rgba(229,115,115,0.12)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E57373',
    marginTop: 10,
  },
  dangerBtnText: {
    color: '#E57373',
    fontSize: 15,
    fontWeight: '600',
  },
  logoutBtn: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 12,
  },
  logoutText: {
    color: '#7B8497',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
});
