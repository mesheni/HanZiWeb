import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './navigation/RootNavigator';
import { useAuthStore, setQueueStorage, getSync, api } from './bootstrap';
import { getDatabase } from './db/database';
import { createWatermelonQueueStorage } from './db/WatermelonQueueStorage';
import type { AuthResponse } from '@hanzi/shared';

export default function App(): React.ReactElement {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 1. Open WatermelonDB on the SQLite adapter.
        const db = await getDatabase();

        // 2. Wire the SDK's queue storage to the WatermelonDB
        //    `pending_changes` table. After this, `getSync()` is bound
        //    to the real on-device queue and will start syncing
        //    pending answers as soon as the user goes online.
        setQueueStorage(createWatermelonQueueStorage(db));

        // 3. Try to hydrate the auth session. The mobile `api.post`
        //    helper automatically attaches the persisted refresh token
        //    as a Bearer header (see `bootstrap.ts`). If there's no
        //    token or the server rejects it, we just land on the
        //    login screen.
        await useAuthStore.getState().hydrateAuth(async () => {
          const result = await api.post<AuthResponse & { refreshToken: string }>(
            '/auth/refresh',
            {},
            { withRefreshToken: true },
          );
          if (!result.ok || !result.data) return null;
          return result.data;
        });

        // 4. Boot the sync engine. It will auto-flush any pending
        //    answers from previous sessions once we have network.
        getSync();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('App init failed', err);
        setError(err instanceof Error ? err.message : 'Init failed');
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <Text style={styles.splashTitle}>HanZi</Text>
        <ActivityIndicator color="#4FC3F7" size="large" style={styles.spinner} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <Text style={styles.errorTitle}>Ошибка запуска</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0C0E16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashTitle: {
    color: '#E8EAED',
    fontSize: 48,
    fontWeight: '700',
  },
  spinner: {
    marginTop: 24,
  },
  errorTitle: {
    color: '#E57373',
    fontSize: 18,
    fontWeight: '600',
  },
  errorText: {
    color: '#7B8497',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
