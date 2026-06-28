import { create } from 'zustand';
import type { SessionCard, SrsRating } from '@hanzi/shared';

interface StudyState {
  /** Карточки текущей сессии */
  cards: SessionCard[];
  /** Индекс текущей карточки */
  currentIndex: number;
  /** Перевёрнута ли текущая карточка */
  isFlipped: boolean;
  /** Прогресс сессии */
  progress: { current: number; total: number };
  /** ID активной сессии (с сервера) */
  sessionId: string | null;

  // Actions
  startSession: (cards: SessionCard[], sessionId: string) => void;
  flipCard: () => void;
  rateCard: (rating: SrsRating) => void;
  nextCard: () => void;
  resetSession: () => void;
}

export const useStudyStore = create<StudyState>((set, get) => ({
  cards: [],
  currentIndex: 0,
  isFlipped: false,
  progress: { current: 0, total: 0 },
  sessionId: null,

  startSession: (cards, sessionId) =>
    set({
      cards,
      sessionId,
      currentIndex: 0,
      isFlipped: false,
      progress: { current: 0, total: cards.length },
    }),

  flipCard: () => set({ isFlipped: true }),

  rateCard: (rating) => {
    const { cards, currentIndex } = get();
    const updated = [...cards];
    if (updated[currentIndex]) {
      updated[currentIndex] = { ...updated[currentIndex]!, answered: true, rating };
    }
    set({ cards: updated });
  },

  nextCard: () => {
    const { currentIndex, progress } = get();
    const nextIndex = currentIndex + 1;
    set({
      currentIndex: nextIndex,
      isFlipped: false,
      progress: { ...progress, current: nextIndex },
    });
  },

  resetSession: () =>
    set({
      cards: [],
      currentIndex: 0,
      isFlipped: false,
      progress: { current: 0, total: 0 },
      sessionId: null,
    }),
}));
