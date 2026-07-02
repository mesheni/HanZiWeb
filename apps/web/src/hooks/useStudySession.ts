import { useEffect, useRef } from 'react';
import { useStartSession, useRecordAnswer } from '../queries/sessions';
import { useStudyStore } from '../stores/studyStore';
import { useToastStore } from '../stores/toastStore';
import { useOnlineStatus } from './useOnlineStatus';
import { getDb } from '../db/database';
import { getSyncEngine } from '../db/sync';
import { recalcFsrsLocally } from '../db/fsrs';
import type { SrsRating, StudyMode } from '@hanzi/shared';

export function useStudySession(input: { deckId?: string; mode?: StudyMode } = {}) {
  const { deckId, mode = 'mixed' } = input;
  const startMutation = useStartSession();
  const answerMutation = useRecordAnswer();
  const isOnline = useOnlineStatus();

  const startSession = useStudyStore((s) => s.startSession);
  const cardsCount = useStudyStore((s) => s.cards.length);
  const currentIndex = useStudyStore((s) => s.currentIndex);
  const addToast = useToastStore((s) => s.addToast);

  const generationRef = useRef(0);

  // Запуск сессии при монтировании и при смене deckId/mode
  useEffect(() => {
    resetSession();
    const gen = ++generationRef.current;

    startMutation.mutate(
      { deckId, cardLimit: 20, includeNew: mode !== 'review', mode },
      {
        onSuccess: (session) => {
          if (gen !== generationRef.current) return;
          startSession(session.cards, session.id);
        },
        onError: () => {
          if (gen !== generationRef.current) return;
          addToast('Не удалось начать сессию', 'error');
        },
      },
    );
  }, [deckId, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const retrySession = () => {
    // Сбрасываем стор перед повтором
    useStudyStore.getState().resetSession();
    const gen = ++generationRef.current;

    startMutation.mutate(
      { deckId, cardLimit: 20, includeNew: mode !== 'review', mode },
      {
        onSuccess: (session) => {
          if (gen !== generationRef.current) return;
          startSession(session.cards, session.id);
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

  const resetSession = useStudyStore((s) => s.resetSession);

  const isSessionComplete =
    cardsCount > 0 && currentIndex >= cardsCount;

  return {
    isLoading: startMutation.isPending || (startMutation.isIdle && !cardsCount),
    isError: startMutation.isError,
    isSessionComplete,
    rateCard,
    retrySession,
  };
}
