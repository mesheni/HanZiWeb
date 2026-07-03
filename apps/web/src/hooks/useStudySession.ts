import { useEffect, useRef } from 'react';
import { useStartSession, useRecordAnswer } from '../queries/sessions';
import { useStudyStore } from '../stores/studyStore';
import { useToast } from '../stores/toastStore';
import { useOnlineStatus } from './useOnlineStatus';
import { getDb } from '../db/database';
import { getSyncEngine } from '../db/sync';
import { recalcFsrsLocally } from '../db/fsrs';
import { ACHIEVEMENT_CATALOG, type AchievementType } from '@hanzi/shared';
import type { SrsRating, StudyMode, PracticeType, SessionFilters } from '@hanzi/shared';

export interface UseStudySessionOptions {
  deckId?: string;
  mode?: StudyMode;
  practiceType?: PracticeType;
  /**
   * Фильтры сессии (см. PLAN_Features_v0.2 §12):
   * `minStability`/`maxStability`/`tags`/`onlyWithAudio`/`onlyWithMnemonic`.
   * Если `undefined` — фильтры не применяются.
   */
  filters?: SessionFilters;
  /**
   * Включает автоматический старт сессии при монтировании/смене параметров.
   * По умолчанию `false` — сессия запускается только по `startNow()` /
   * `retrySession()`, что нужно для показа экрана выбора типа практики
   * до первого запроса к API.
   */
  enabled?: boolean;
}

export function useStudySession(input: UseStudySessionOptions = {}) {
  const {
    deckId,
    mode = 'mixed',
    practiceType: practiceTypeProp,
    filters,
    enabled = false,
  } = input;
  const startMutation = useStartSession();
  const answerMutation = useRecordAnswer();
  const isOnline = useOnlineStatus();

  const startSession = useStudyStore((s) => s.startSession);
  const resetSession = useStudyStore((s) => s.resetSession);
  const cardsCount = useStudyStore((s) => s.cards.length);
  const currentIndex = useStudyStore((s) => s.currentIndex);
  const practiceTypeInStore = useStudyStore((s) => s.practiceType);
  const addToast = useToast();

  // Если practiceType не передан явно — берём из стора (позволяет менять
  // его до старта сессии через setPracticeType).
  const practiceType = practiceTypeProp ?? practiceTypeInStore;

  const generationRef = useRef(0);

  // Запуск сессии при смене deckId/mode/practiceType/filters, но только если хук
  // включён (enabled = true). Это нужно, чтобы экран выбора типа практики
  // отображался без побочного эффекта — обращения к /sessions/start.
  useEffect(() => {
    if (!enabled) return;
    resetSession();
    const gen = ++generationRef.current;

    startMutation.mutate(
      {
        deckId,
        cardLimit: 20,
        includeNew: mode !== 'review',
        mode,
        practiceType,
        filters,
      },
      {
        onSuccess: (session) => {
          if (gen !== generationRef.current) return;
          startSession(session.cards, session.id, { mode, practiceType });
        },
        onError: () => {
          if (gen !== generationRef.current) return;
          addToast('Не удалось начать сессию', 'error');
        },
      },
    );
  }, [deckId, mode, practiceType, enabled, JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNow = (overrideFilters?: SessionFilters) => {
    // Сбрасываем стор перед стартом
    useStudyStore.getState().resetSession();
    const gen = ++generationRef.current;

    startMutation.mutate(
      {
        deckId,
        cardLimit: 20,
        includeNew: mode !== 'review',
        mode,
        practiceType,
        filters: overrideFilters ?? filters,
      },
      {
        onSuccess: (session) => {
          if (gen !== generationRef.current) return;
          startSession(session.cards, session.id, { mode, practiceType });
        },
        onError: () => {
          if (gen !== generationRef.current) return;
          addToast('Не удалось начать сессию', 'error');
        },
      },
    );
  };

  const retrySession = () => {
    // Сбрасываем стор перед повтором
    useStudyStore.getState().resetSession();
    const gen = ++generationRef.current;

    startMutation.mutate(
      {
        deckId,
        cardLimit: 20,
        includeNew: mode !== 'review',
        mode,
        practiceType,
        filters,
      },
      {
        onSuccess: (session) => {
          if (gen !== generationRef.current) return;
          startSession(session.cards, session.id, { mode, practiceType });
        },
        onError: () => {
          if (gen !== generationRef.current) return;
          addToast('Не удалось начать сессию', 'error');
        },
      },
    );
  };

  const rateCard = (rating: SrsRating) => {
    const { cards, currentIndex, sessionId } = useStudyStore.getState();

    const card = cards[currentIndex];
    if (!card || !sessionId) return;

    // Захватываем индекс в замыкание этого конкретного вызова,
    // чтобы onError откатывал именно ту карточку, на которой был ответ
    const answeredIndex = currentIndex;

    const studyStore = useStudyStore.getState();
    studyStore.rateCard(rating);
    studyStore.nextCard();

    const db = getDb();
    if (db) {
      db.progress.findOne({ selector: { wordId: card.word.id } }).exec().then((existing) => {
        const currentState = (existing?.state as any) ?? 'new';
        const currentStability = (existing?.stability as number) ?? 0;
        const currentDifficulty = (existing?.difficulty as number) ?? 0;
        let currentReps = (existing?.reps as number) ?? 0;

        const fsrs = recalcFsrsLocally(rating, currentStability, currentDifficulty, currentState);

        db.progress.upsert({
          id: existing?.id ?? crypto.randomUUID(),
          userId: '',
          wordId: card.word.id,
          state: fsrs.newState,
          stability: fsrs.newStability,
          difficulty: fsrs.newDifficulty,
          reps: currentReps + 1,
          dueDate: new Date(Date.now() + fsrs.intervalDays * 86400000).toISOString(),
          lastReviewDate: new Date().toISOString(),
        });
      });

      const sync = getSyncEngine();
      if (sync) {
        sync.enqueueChange('study_answer', {
          wordId: card.word.id,
          rating,
        });
      }
    }

    if (isOnline) {
      answerMutation.mutate(
        {
          sessionId,
          wordId: card.word.id,
          rating,
        },
        {
          onSuccess: (data) => {
            for (const ach of data.unlockedAchievements ?? []) {
              const meta = ACHIEVEMENT_CATALOG.find((a) => a.type === (ach.type as AchievementType));
              const title = meta?.title ?? ach.type;
              addToast(`🏆 Достижение: ${title}`, 'success');
            }
          },
          onError: () => {
            useStudyStore.setState((state) => {
              const updated = [...state.cards];
              if (updated[answeredIndex]) {
                updated[answeredIndex] = {
                  ...updated[answeredIndex]!,
                  answered: false,
                  rating: undefined,
                };
              }
              return {
                cards: updated,
                currentIndex: answeredIndex,
                isFlipped: false,
                progress: {
                  ...state.progress,
                  current: answeredIndex,
                },
              };
            });
            addToast('Ошибка сохранения ответа. Попробуйте ещё раз.', 'error');
          },
        },
      );
    }
  };

  const isSessionComplete =
    cardsCount > 0 && currentIndex >= cardsCount;

  return {
    isLoading: startMutation.isPending || (enabled && startMutation.isIdle && !cardsCount),
    isError: startMutation.isError,
    isSessionComplete,
    rateCard,
    retrySession,
    startNow,
  };
}
