import { useEffect, useRef } from 'react';
import { useStartSession, useRecordAnswer } from '../queries/sessions';
import { useStudyStore } from '../stores/studyStore';
import { useToastStore } from '../stores/toastStore';
import { useOnlineStatus } from './useOnlineStatus';
import { getDb } from '../db/database';
import { getSyncEngine } from '../db/sync';
import { recalcFsrsLocally } from '../db/fsrs';
import type { SrsRating } from '@hanzi/shared';

/**
 * Хук оркестрации учебной сессии:
 *  - запускает сессию (POST /sessions/start) при монтировании;
 *  - наполняет studyStore карточками;
 *  - предоставляет rateCard(), выполняющий POST /sessions/:id/answer
 *    с optimistic-update (немедленный переход к следующей карточке),
 *    откатом и toast-ом при ошибке;
 *  - предоставляет флаг isSessionComplete — все карточки пройдены.
 */
export function useStudySession(deckId?: string) {
  const startMutation = useStartSession();
  const answerMutation = useRecordAnswer();
  const isOnline = useOnlineStatus();

  const store = useStudyStore();
  const addToast = useToastStore((s) => s.addToast);

  // Запоминаем предыдущий индекс для отката
  const prevIndexRef = useRef<number>(0);

  // Старт сессии — один раз при монтировании
  useEffect(() => {
    startMutation.mutate(
      { deckId, cardLimit: 20, includeNew: true },
      {
        onSuccess: (session) => {
          store.startSession(session.cards, session.id);
        },
        onError: () => {
          addToast('Не удалось начать сессию', 'error');
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rateCard = (rating: SrsRating) => {
    const { cards, currentIndex, sessionId } = store;

    const card = cards[currentIndex];
    if (!card || !sessionId) return;

    // Снимок состояния для отката
    prevIndexRef.current = currentIndex;

    // Optimistic update: сразу помечаем карточку отвеченной и переходим к следующей
    store.rateCard(rating);
    store.nextCard();

    // Сохраняем ответ локально (RxDB) + в очередь синхронизации
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

    // Фоновый запрос на сервер (только если онлайн)
    if (isOnline) {
      answerMutation.mutate(
        {
          sessionId,
          wordId: card.word.id,
          rating,
        },
        {
          onError: () => {
            // Откат: возвращаемся к карточке, убираем отметку answered
            useStudyStore.setState((state) => {
              const updated = [...state.cards];
              if (updated[prevIndexRef.current]) {
                updated[prevIndexRef.current] = {
                  ...updated[prevIndexRef.current]!,
                  answered: false,
                  rating: undefined,
                };
              }
              return {
                cards: updated,
                currentIndex: prevIndexRef.current,
                isFlipped: false,
                progress: {
                  ...state.progress,
                  current: prevIndexRef.current,
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
    store.cards.length > 0 && store.currentIndex >= store.cards.length;

  return {
    isLoading: startMutation.isPending,
    isError: startMutation.isError || answerMutation.isError,
    isSessionComplete,
    rateCard,
  };
}
