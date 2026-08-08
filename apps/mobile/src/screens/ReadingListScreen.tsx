import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../bootstrap';
import type { RootStackParamList } from '../navigation/types';

interface ReadingTextListItem {
  id: string;
  title: string;
  hskLevel: number;
  wordCount: number;
  knownWordsCount: number;
  author: string | null;
  source: string | null;
  readAt: string | null;
}

type Nav = NativeStackNavigationProp<RootStackParamList, 'ReadingList'>;

/** F22c: список текстов для чтения. */
export function ReadingListScreen(): React.ReactElement {
  const navigation = useNavigation<Nav>();
  const [texts, setTexts] = useState<ReadingTextListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<ReadingTextListItem[]>('/reading/texts');
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTexts(result.data);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Чтение</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>Повторить</Text>
          </Pressable>
        </View>
      ) : !texts ? (
        <View style={styles.center}>
          <ActivityIndicator color="#4FC3F7" />
        </View>
      ) : texts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Текстов пока нет.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {texts.map((t) => (
            <Pressable
              key={t.id}
              style={styles.textCard}
              onPress={() => navigation.navigate('ReadingText', { id: t.id, title: t.title })}
            >
              <View style={styles.textHeader}>
                <Text style={styles.textTitle}>{t.title}</Text>
                {t.readAt ? (
                  <View style={styles.readBadge}>
                    <Text style={styles.readBadgeText}>Прочитано</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.textMeta}>
                HSK {t.hskLevel} · {t.wordCount} слов · знакомо {t.knownWordsCount}
              </Text>
              {t.author ? <Text style={styles.textAuthor}>{t.author}</Text> : null}
            </Pressable>
          ))}
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
  },
  back: {
    color: '#4FC3F7',
    fontSize: 22,
    width: 32,
  },
  title: {
    color: '#E8EAED',
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  empty: {
    color: '#7B8497',
    fontSize: 15,
  },
  error: {
    color: '#E57373',
    fontSize: 14,
    marginBottom: 12,
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
  list: {
    padding: 16,
    paddingTop: 0,
  },
  textCard: {
    backgroundColor: '#141820',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  textHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textTitle: {
    color: '#E8EAED',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  readBadge: {
    backgroundColor: 'rgba(129,199,132,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  readBadgeText: {
    color: '#81C784',
    fontSize: 11,
    fontWeight: '600',
  },
  textMeta: {
    color: '#7B8497',
    fontSize: 13,
    marginTop: 6,
  },
  textAuthor: {
    color: '#4A5161',
    fontSize: 12,
    marginTop: 2,
  },
});
