import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { api } from '../bootstrap';
import type { RootStackParamList } from '../navigation/types';
import type { ReadingTextDetail } from '@hanzi/shared';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ReadingText'>;
type Route = RouteProp<RootStackParamList, 'ReadingText'>;

/** F22c: текст с подсветкой знакомых слов и «Отметить прочитанным». */
export function ReadingTextScreen(): React.ReactElement {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const [text, setText] = useState<ReadingTextDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<ReadingTextDetail>(`/reading/texts/${route.params.id}`);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setText(result.data);
    setError(null);
  }, [route.params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async () => {
    const result = await api.post(`/reading/texts/${route.params.id}/mark-read`, {});
    if (result.ok) void load();
  };

  // F22c: сегменты текста с цветом слова по состоянию прогресса.
  const segments = useMemo(() => {
    if (!text) return [];
    const out: Array<{ key: string; surface: string; color?: string }> = [];
    for (const paragraph of text.paragraphs) {
      let rest = paragraph;
      let base = 0;
      // tokens.position — глобальный офсет в полном тексте; упрощённо
      // ищем токены внутри абзаца по surface (надёжнее для мобильного
      // рендера, чем офсетная математика).
      const matched: Array<{ at: number; surface: string; color: string }> = [];
      for (const token of text.tokens) {
        if (!token.word || !token.state) continue;
        const color = STATE_COLORS[token.state];
        if (!color) continue;
        let idx = rest.indexOf(token.surface);
        while (idx !== -1) {
          matched.push({ at: base + idx, surface: token.surface, color });
          idx = rest.indexOf(token.surface, idx + token.surface.length);
        }
      }
      matched.sort((a, b) => a.at - b.at);
      let pos = 0;
      for (const m of matched) {
        if (m.at < pos) continue;
        if (m.at > pos)
          out.push({ key: `${base}-${pos}`, surface: rest.slice(pos - base, m.at - base) });
        out.push({ key: `${base}-${m.at}`, surface: m.surface, color: m.color });
        pos = m.at + m.surface.length;
      }
      if (pos < rest.length) out.push({ key: `${base}-${pos}`, surface: rest.slice(pos - base) });
      base += rest.length + 1;
    }
    return out;
  }, [text]);

  // ReadingTextDetail не несёт knownWordsCount — считаем из токенов:
  // слово «известно», если у него есть прогресс (state != null).
  const knownWords = useMemo(() => {
    if (!text) return 0;
    const ids = new Set<string>();
    for (const token of text.tokens) {
      if (token.word?.id && token.state) ids.add(token.word.id);
    }
    return ids.size;
  }, [text]);

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>Повторить</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!text) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color="#4FC3F7" />
        </View>
      </SafeAreaView>
    );
  }

  const knownPct = text.wordCount > 0 ? Math.round((knownWords / text.wordCount) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {route.params.title}
        </Text>
        <Pressable onPress={() => void markRead()} hitSlop={12}>
          <Text style={styles.markRead}>{text.readAt ? '✓' : 'Прочитано'}</Text>
        </Pressable>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          HSK {text.hskLevel} · знакомо {knownPct}% ({knownWords}/{text.wordCount})
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.paragraphText}>
          {segments.map((s) => (
            <Text key={s.key} style={s.color ? { color: s.color } : undefined}>
              {s.surface}
            </Text>
          ))}
        </Text>
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Цвета слов:</Text>
          <Text style={[styles.legendItem, { color: '#E57373' }]}>■ новое</Text>
          <Text style={[styles.legendItem, { color: '#FFB74D' }]}>■ учу</Text>
          <Text style={[styles.legendItem, { color: '#81C784' }]}>■ повторяю</Text>
          <Text style={[styles.legendItem, { color: '#4FC3F7' }]}>■ выучено</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const STATE_COLORS: Record<string, string> = {
  new: '#E57373',
  learning: '#FFB74D',
  review: '#81C784',
  graduated: '#4FC3F7',
};

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
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  markRead: {
    color: '#4FC3F7',
    fontSize: 14,
    fontWeight: '600',
  },
  statsBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statsText: {
    color: '#7B8497',
    fontSize: 13,
  },
  body: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  paragraphText: {
    color: '#E8EAED',
    fontSize: 17,
    lineHeight: 28,
  },
  legend: {
    marginTop: 28,
    padding: 14,
    backgroundColor: '#141820',
    borderRadius: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendTitle: {
    color: '#7B8497',
    fontSize: 13,
    fontWeight: '600',
    width: '100%',
    marginBottom: 4,
  },
  legendItem: {
    fontSize: 13,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
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
});
