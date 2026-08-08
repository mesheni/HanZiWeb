import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import { WordModel, ProgressModel } from './models';
import { selectLocalCards, type LocalCard } from './sessionSelection';

/**
 * F21: офлайн-сессия, построенная из локальных таблиц WatermelonDB
 * (words + progress). Сессии больше не требуют сети: когда
 * `/sessions/start` недоступен, StudyScreen показывает карточки,
 * собранные на устройстве; ответы уходят в офлайн-очередь как обычно.
 */

export interface LocalSession {
  id: string;
  cards: LocalCard[];
  cardsTotal: number;
  cardsCompleted: number;
  local: boolean;
}

/** Валидный по формату uuid v4 — sessionId уходит в study_answer, и
 * Prisma/Postgres не должен падать на невалидном uuid. */
export function localSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function buildLocalSession(
  db: Database,
  userId: string | null,
  options: { cardLimit: number; includeNew: boolean },
): Promise<LocalSession | null> {
  const [wordRows, progressRows] = await Promise.all([
    db.get<WordModel>('words').query().fetch(),
    db
      .get<ProgressModel>('progress')
      .query(...(userId ? [Q.where('user_id', userId)] : []))
      .fetch(),
  ]);

  const cards = selectLocalCards(
    wordRows.map((w) => ({
      id: w.id,
      character: w.character,
      pinyin: w.pinyin,
      translation: w.translation,
    })),
    progressRows.map((p) => ({
      wordId: p.wordId,
      state: p.state,
      stability: p.stability,
      difficulty: p.difficulty,
      dueDate: p.dueDate,
    })),
    options,
  );

  if (cards.length === 0) return null;
  return {
    id: localSessionId(),
    cards,
    cardsTotal: cards.length,
    cardsCompleted: 0,
    local: true,
  };
}
