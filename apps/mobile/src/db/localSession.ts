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
  const progressRows = await db
    .get<ProgressModel>('progress')
    .query(...(userId ? [Q.where('user_id', userId)] : []))
    .fetch();

  // Полный fetch словаря материализовал 5000+ строк ради ~20 карточек.
  // Вместо этого: due-слова — точной выборкой по id из прогресса, а
  // кандидаты в новые — префикс словаря (сервер выдаёт новые слова
  // в том же порядке hskLevel/createdAt, см. sessions.service.ts).
  const now = Date.now();
  const dueIds = progressRows
    .filter((p) => Date.parse(p.dueDate) <= now)
    .map((p) => p.wordId);

  const [dueWordRows, newWordRows] = await Promise.all([
    dueIds.length > 0
      ? db.get<WordModel>('words').query(Q.where('id', Q.oneOf(dueIds))).fetch()
      : Promise.resolve([] as WordModel[]),
    db
      .get<WordModel>('words')
      .query(Q.take(Math.max(options.cardLimit * 5, options.cardLimit)))
      .fetch(),
  ]);

  const seenIds = new Set<string>();
  const wordRows = [...dueWordRows, ...newWordRows].filter((w) => {
    if (seenIds.has(w.id)) return false;
    seenIds.add(w.id);
    return true;
  });

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
