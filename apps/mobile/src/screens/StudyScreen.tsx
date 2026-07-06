import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, getSync } from '../bootstrap';
import { recalcFsrs, RATING_XP } from '@hanzi/mobile-sdk';
import type { SrsRating, WordState } from '@hanzi/shared';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Study'>;

interface Card {
  index: number;
  word: {
    id: string;
    character: string;
    pinyin: string;
    translation: string;
  };
  state: WordState;
  answered: boolean;
}

interface SessionData {
  id: string;
  cards: Card[];
  cardsTotal: number;
  cardsCompleted: number;
}

const RATING_BUTTONS: Array<{ rating: SrsRating; label: string; color: string }> = [
  { rating: 1, label: 'Не помню', color: '#E57373' },
  { rating: 2, label: 'Трудно', color: '#FFB74D' },
  { rating: 3, label: 'Помню', color: '#81C784' },
  { rating: 4, label: 'Легко', color: '#4FC3F7' },
];

export function StudyScreen({ navigation }: Props): React.ReactElement {
  const [session, setSession] = useState<SessionData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await api.post<SessionData>('/sessions/start', {
      cardLimit: 20,
      includeNew: true,
      mode: 'mixed',
      practiceType: 'flip-card',
    });
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }
    setSession(result.data);
    setCurrentIndex(0);
    setFlipped(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void startSession();
  }, [startSession]);

  const handleRate = async (rating: SrsRating) => {
    if (!session || submitting) return;
    const card = session.cards[currentIndex];
    if (!card) return;
    setSubmitting(true);

    // Optimistic local update via FSRS (mirrors web's
    // `recalcFsrsLocally` in `apps/web/src/db/fsrs.ts`). Even if the
    // server is unreachable, the user sees the same next-due-date as
    // they would on web.
    const localUpdate = recalcFsrs(rating, 0, 0, card.state);

    // Queue the answer to be synced later — exactly the same as
    // `apps/web/src/hooks/useStudySession.ts` does.
    try {
      await getSync().enqueueChange('study_answer', {
        wordId: card.word.id,
        rating,
        sessionId: session.id,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось сохранить ответ офлайн.');
    }

    // Also try the live endpoint so the server can grant XP / check
    // achievements / etc. immediately when online. If we're offline,
    // the live call fails silently — the queue will sync on reconnect.
    const liveResult = await api.post(`/sessions/${session.id}/answer`, {
      wordId: card.word.id,
      rating,
    });
    if (!liveResult.ok) {
      // eslint-disable-next-line no-console
      console.warn('Live answer failed; queued for sync:', liveResult.message);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[FSRS] local newStability=${localUpdate.newStability.toFixed(2)} xp+=${RATING_XP[rating]}`,
      );
    }

    setSubmitting(false);
    setFlipped(false);
    if (currentIndex + 1 >= session.cards.length) {
      // Session complete
      Alert.alert('Готово!', `Сессия завершена. +${RATING_XP[rating]} XP`, [
        {
          text: 'OK',
          onPress: () => {
            setSession(null);
            void startSession();
          },
        },
      ]);
      return;
    }
    setCurrentIndex((i) => i + 1);
  };

  if (loading && !session) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color="#4FC3F7" size="large" />
          <Text style={styles.loadingText}>Готовим тренировку…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={startSession}>
            <Text style={styles.retryText}>Повторить</Text>
          </Pressable>
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>Назад</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!session || session.cards.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Слов для повторения нет</Text>
          <Text style={styles.emptyHint}>Загляни сюда позже ☕</Text>
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>Назад</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const card = session.cards[currentIndex]!;
  const progress = (currentIndex + 1) / session.cards.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.progressBar}>
        <View
          style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
        />
      </View>
      <View style={styles.progressText}>
        <Text style={styles.progressNumber}>
          {currentIndex + 1} / {session.cards.length}
        </Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.exit}>Выйти</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.card}
        onPress={() => setFlipped((f) => !f)}
        disabled={submitting}
      >
        {flipped ? (
          <View style={styles.cardBack}>
            <Text style={styles.cardTranslation}>{card.word.translation}</Text>
          </View>
        ) : (
          <View style={styles.cardFront}>
            <Text style={styles.cardCharacter}>{card.word.character}</Text>
            <Text style={styles.cardPinyin}>{card.word.pinyin}</Text>
            <Text style={styles.tapHint}>Нажми, чтобы перевернуть</Text>
          </View>
        )}
      </Pressable>

      {flipped ? (
        <View style={styles.rateRow}>
          {RATING_BUTTONS.map((b) => (
            <Pressable
              key={b.rating}
              style={[styles.rateButton, { backgroundColor: b.color }, submitting && styles.rateDisabled]}
              onPress={() => void handleRate(b.rating)}
              disabled={submitting}
            >
              <Text style={styles.rateText}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.rateRow}>
          <Text style={styles.hint}>Переверни карточку и оцени свой ответ</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0C0E16',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#7B8497',
    marginTop: 12,
  },
  error: {
    color: '#E57373',
    fontSize: 15,
    marginBottom: 16,
    textAlign: 'center',
  },
  retry: {
    backgroundColor: '#1E2330',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  retryText: {
    color: '#4FC3F7',
    fontSize: 15,
    fontWeight: '500',
  },
  back: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backText: {
    color: '#7B8497',
    fontSize: 15,
  },
  emptyTitle: {
    color: '#E8EAED',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyHint: {
    color: '#7B8497',
    fontSize: 14,
    marginBottom: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#141820',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4FC3F7',
  },
  progressText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  progressNumber: {
    color: '#7B8497',
    fontSize: 14,
  },
  exit: {
    color: '#7B8497',
    fontSize: 14,
  },
  card: {
    flex: 1,
    margin: 16,
    backgroundColor: '#141820',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cardFront: {
    alignItems: 'center',
  },
  cardCharacter: {
    color: '#E8EAED',
    fontSize: 120,
    fontWeight: '500',
  },
  cardPinyin: {
    color: '#4FC3F7',
    fontSize: 24,
    marginTop: 16,
  },
  tapHint: {
    color: '#7B8497',
    fontSize: 13,
    marginTop: 32,
  },
  cardBack: {
    alignItems: 'center',
  },
  cardTranslation: {
    color: '#E8EAED',
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
  },
  rateRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    justifyContent: 'space-between',
  },
  rateButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  rateDisabled: {
    opacity: 0.5,
  },
  rateText: {
    color: '#0C0E16',
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    color: '#7B8497',
    fontSize: 14,
    textAlign: 'center',
    flex: 1,
    lineHeight: 20,
  },
});
