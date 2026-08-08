import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, getSync, useAuthStore } from '../bootstrap';
import { recalcFsrs, RATING_XP, isOnline } from '@hanzi/mobile-sdk';
import type { SrsRating, WordState } from '@hanzi/shared';
import type { RootStackParamList } from '../navigation/types';
import { getDatabase } from '../db/database';
import { buildLocalSession, type LocalSession } from '../db/localSession';

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
  /** FSRS stability на момент выдачи карточки (PLAN_Features_v0.4 §50). */
  stability: number;
  /** FSRS difficulty (каноническая шкала [1, 10], §46). */
  difficulty: number;
  answered: boolean;
  /** Заполняется оптимистичным пересчётом после оценки (UI-feedback). */
  intervalDays?: number;
  dueDate?: string;
}

interface LastAnswer {
  xp: number;
  intervalDays: number;
}

interface SessionData {
  id: string;
  cards: Card[];
  cardsTotal: number;
  cardsCompleted: number;
  /** F21: true — сессия собрана локально (офлайн), без серверной сессии. */
  local: boolean;
}

const RATING_BUTTONS: Array<{ rating: SrsRating; label: string; color: string }> = [
  { rating: 1, label: 'Не помню', color: '#E57373' },
  { rating: 2, label: 'Трудно', color: '#FFB74D' },
  { rating: 3, label: 'Помню', color: '#81C784' },
  { rating: 4, label: 'Легко', color: '#4FC3F7' },
];

/** F21: локальная сессия (WatermelonDB) приводится к виду серверной. */
function toSessionData(local: LocalSession): SessionData {
  return {
    id: local.id,
    cards: local.cards.map((card, index) => ({
      index,
      word: card.word,
      state: card.state as WordState,
      stability: card.stability,
      difficulty: card.difficulty,
      answered: false,
    })),
    cardsTotal: local.cardsTotal,
    cardsCompleted: local.cardsCompleted,
    local: true,
  };
}

export function StudyScreen({ navigation }: Props): React.ReactElement {
  const [session, setSession] = useState<SessionData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<LastAnswer | null>(null);

  const startSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    // F21: сначала пробуем серверную сессию, но при отсутствии сети или
    // сбое API собираем сессию из локальных таблиц WatermelonDB
    // (words + progress). Сессии больше не требуют сеть: офлайн-карточки
    // оцениваются через recalcFsrs, а ответы уходят в офлайн-очередь.
    if (isOnline()) {
      const result = await api.post<SessionData>('/sessions/start', {
        cardLimit: 20,
        includeNew: true,
        mode: 'mixed',
        practiceType: 'flip-card',
      });
      if (result.ok) {
        setSession({ ...result.data, local: false });
        setCurrentIndex(0);
        setFlipped(false);
        setLoading(false);
        return;
      }
      console.warn('Server session failed; falling back to local session:', result.message);
    }

    const db = await getDatabase();
    const authUserId = useAuthStore.getState().user?.id ?? null;
    const local = await buildLocalSession(db, authUserId, { cardLimit: 20, includeNew: true });
    if (local) {
      setSession(toSessionData(local));
      setCurrentIndex(0);
      setFlipped(false);
      setLoading(false);
      return;
    }

    setError('Нет сети и нет сохранённых слов. Подключитесь к интернету, чтобы скачать словарь.');
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

    // Момент ответа штампуется ОДИН раз и используется и в live-post
    // (поле answeredAt), и в payload офлайн-очереди (timestamp).
    // Сервер ставит lastReviewDate = answeredAt, поэтому дедуп
    // `changeTime <= existingTime` в sync.service.ts отбрасывает
    // fallback-flush после успешного live-post: T1 === T2 → ответ не
    // применяется дважды (fix v0.4 §45 follow-up).
    const answeredAt = new Date().toISOString();

    // Optimistic local update via FSRS (mirrors web's
    // `recalcFsrsLocally` in `apps/web/src/db/fsrs.ts`). Uses the real
    // FSRS parameters the server sent in the session card — before
    // §50 the call started from `(0, 0)` and the UI never reflected the
    // new due date until the next `/sessions/start` re-fetched data.
    const localUpdate = recalcFsrs(rating, card.stability, card.difficulty, card.state);

    // Мгновенная UI-обратная связь: применяем пересчёт к карточке в
    // локальном стейте (state/stability/difficulty/dueDate), чтобы
    // сессия и следующий start вели себя как после серверного ответа.
    const nextDueDate = new Date(Date.now() + localUpdate.intervalDays * 86_400_000).toISOString();
    setSession((prev) => {
      if (!prev) return prev;
      const cards = prev.cards.map((c, i) =>
        i === currentIndex
          ? {
              ...c,
              state: localUpdate.newState,
              stability: localUpdate.newStability,
              difficulty: localUpdate.newDifficulty,
              answered: true,
              intervalDays: localUpdate.intervalDays,
              dueDate: nextDueDate,
            }
          : c,
      );
      return { ...prev, cards };
    });
    setLastAnswer({ xp: RATING_XP[rating], intervalDays: localUpdate.intervalDays });

    // Один ответ — ровно один пересчёт прогресса (PLAN_Features_v0.4 §45):
    // онлайн → только live-post `/sessions/:id/answer` (сервер сразу даёт
    // XP/достижения), в очередь НЕ кладём;
    // оффлайн → только enqueueChange, flush догонит через `/sync`
    // на реконнекте, live-post не делаем.
    // Отправлять оба нельзя: sync.service.ts применил бы ответ дважды —
    // reps/XP инкрементятся ×2, «Again» применяется два раза.
    const enqueueOffline = async (): Promise<void> => {
      try {
        await getSync().enqueueChange('study_answer', {
          wordId: card.word.id,
          rating,
          sessionId: session.id,
          timestamp: answeredAt,
        });
      } catch {
        Alert.alert('Ошибка', 'Не удалось сохранить ответ офлайн.');
      }
    };

    if (isOnline()) {
      const liveResult = await api.post(`/sessions/${session.id}/answer`, {
        wordId: card.word.id,
        rating,
        answeredAt,
      });
      if (!liveResult.ok) {
        // Live-post не прошёл (сетевая ошибка в момент запроса) — кладём
        // в очередь с тем же answeredAt; сервер применит его ровно один
        // раз, когда связь вернётся: если live-post всё же успел
        // примениться, дедуп по timestamp (T1 === T2) в sync.service.ts
        // отбросит запись (fix v0.4 §45 follow-up).
        console.warn('Live answer failed; falling back to offline queue:', liveResult.message);
        await enqueueOffline();
      } else {
        console.log(
          `[FSRS] local newStability=${localUpdate.newStability.toFixed(2)} xp+=${RATING_XP[rating]}`,
        );
      }
    } else {
      await enqueueOffline();
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
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <View style={styles.progressText}>
        <Text style={styles.progressNumber}>
          {currentIndex + 1} / {session.cards.length}
        </Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.exit}>Выйти</Text>
        </Pressable>
      </View>

      {session.local ? (
        <Text style={styles.offlineBadge}>
          Офлайн-режим · ответы синхронизируются при появлении сети
        </Text>
      ) : null}

      {lastAnswer ? (
        <Text style={styles.lastAnswer}>
          +{lastAnswer.xp} XP · следующее повторение{' '}
          {lastAnswer.intervalDays > 0 ? `через ${lastAnswer.intervalDays} дн.` : 'сегодня'}
        </Text>
      ) : null}

      <Pressable style={styles.card} onPress={() => setFlipped((f) => !f)} disabled={submitting}>
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
              style={[
                styles.rateButton,
                { backgroundColor: b.color },
                submitting && styles.rateDisabled,
              ]}
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
  lastAnswer: {
    color: '#81C784',
    fontSize: 13,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 4,
  },
  exit: {
    color: '#7B8497',
    fontSize: 14,
  },
  offlineBadge: {
    color: '#FFB74D',
    fontSize: 12,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 8,
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
