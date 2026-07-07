import { create } from 'zustand';
import type { SessionCard, SrsRating, PracticeType, StudyMode } from '@hanzi/shared';

interface StudyState {
  /** Карточки текущей сессии */
  cards: SessionCard[];
  /** Индекс текущей карточки */
  currentIndex: number;
  /** Перевёрнута ли текущая карточка (для flip-card) */
  isFlipped: boolean;
  /** Идёт ли CSS-анимация переворота (PLAN_Features_v0.3 #12).
   *  Пока true — нельзя переворачивать снова и нельзя переходить
   *  к следующему слову, иначе можно подсмотреть его перевод. */
  isFlipping: boolean;
  /** Прогресс сессии */
  progress: { current: number; total: number };
  /** ID активной сессии (с сервера) */
  sessionId: string | null;
  /** Режим сессии (mixed | review | learn) */
  mode: StudyMode;
  /** Тип практики (flip-card | multiple-choice | …) */
  practiceType: PracticeType;

  // Actions
  startSession: (cards: SessionCard[], sessionId: string, opts?: { mode?: StudyMode; practiceType?: PracticeType }) => void;
  setPracticeType: (type: PracticeType) => void;
  flipCard: () => void;
  setIsFlipping: (v: boolean) => void;
  rateCard: (rating: SrsRating) => void;
  nextCard: () => void;
  resetSession: () => void;
}

export const useStudyStore = create<StudyState>((set, get) => ({
  cards: [],
  currentIndex: 0,
  isFlipped: false,
  isFlipping: false,
  progress: { current: 0, total: 0 },
  sessionId: null,
  mode: 'mixed',
  practiceType: 'flip-card',

  startSession: (cards, sessionId, opts) =>
    set({
      cards,
      sessionId,
      currentIndex: 0,
      isFlipped: false,
      isFlipping: false,
      progress: { current: 0, total: cards.length },
      mode: opts?.mode ?? 'mixed',
      practiceType: opts?.practiceType ?? 'flip-card',
    }),

  setPracticeType: (type) => set({ practiceType: type }),

  flipCard: () => {
    const { isFlipping } = get();
    if (isFlipping) return;
    set({ isFlipped: true, isFlipping: true });
  },

  setIsFlipping: (v) => set({ isFlipping: v }),

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
      isFlipping: false,
      progress: { ...progress, current: nextIndex },
    });
  },

  resetSession: () =>
    set({
      cards: [],
      currentIndex: 0,
      isFlipped: false,
      isFlipping: false,
      progress: { current: 0, total: 0 },
      sessionId: null,
      mode: 'mixed',
      practiceType: 'flip-card',
    }),
}));
