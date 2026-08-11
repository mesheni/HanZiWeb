import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StartSessionSchema } from '@hanzi/shared';
import { prisma } from '../../lib/prisma.js';
import { startSession } from './sessions.service.js';

const testEmail = `priority-test-${Date.now()}@hanzi.local`;
let userId = '';
let wordIds: string[] = [];

interface CardWithWord {
  word: { id: string };
}

function firstWordId(session: { cards: CardWithWord[] }): string | undefined {
  return session.cards[0]?.word.id;
}

describe('startSession priority words', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: testEmail },
    });
    userId = user.id;

    // F33: слова создаём сами — тест не зависит от HSK-сидов (тестовая
    // БД изолирована от dev).
    const mk = (char: string) =>
      prisma.word.create({
        data: { character: char, pinyin: 'x', translation: 'x', hskLevel: 1 },
      });
    wordIds = [(await mk(`优${Date.now()}a`)).id, (await mk(`优${Date.now()}b`)).id];
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (wordIds.length > 0) {
      await prisma.word.deleteMany({ where: { id: { in: wordIds } } });
    }
  });

  it('prepends priority words to the session', async () => {
    expect(wordIds.length).toBeGreaterThanOrEqual(2);
    const priorityWordId = wordIds[0];
    const otherWordId = wordIds[1];
    if (!priorityWordId || !otherWordId) throw new Error('wordIds missing');

    try {
      await prisma.userWordPriority.create({
        data: { userId, wordId: priorityWordId },
      });

      const session = await startSession(
        userId,
        StartSessionSchema.parse({
          cardLimit: 5,
          includeNew: false,
          mode: 'mixed',
          practiceType: 'flip-card',
        }),
      );

      expect(session.cards.length).toBeGreaterThan(0);
      expect(firstWordId(session as { cards: CardWithWord[] })).toBe(priorityWordId);

      // Убираем priority-строку ДО второго запуска сессии (но НЕ прогресс —
      // его создал loadPriorityCards в первом startSession). normalSession
      // (learn) исключает слова с прогрессом (PLAN_Features_v0.4 §33),
      // поэтому приоритетное слово детерминированно не возвращается.
      await prisma.userWordPriority.deleteMany({
        where: { userId, wordId: priorityWordId },
      });
      await prisma.session.deleteMany({ where: { userId } });

      const normalSession = await startSession(
        userId,
        StartSessionSchema.parse({
          cardLimit: 5,
          includeNew: true,
          mode: 'learn',
          practiceType: 'flip-card',
        }),
      );

      const seen = new Set(normalSession.cards.map((c) => (c as CardWithWord).word.id));
      expect(seen.has(priorityWordId)).toBe(false);
    } finally {
      // Чистка в finally: упавший ассерт не должен оставить
      // UserWordPriority (unique @@unique([userId, wordId])) — иначе
      // следующий тест этого файла упадёт с P2002 (PLAN_Features_v0.4 §29).
      await prisma.userWordPriority.deleteMany({
        where: { userId, wordId: priorityWordId },
      });
      await prisma.userWordProgress.deleteMany({
        where: { userId, wordId: { in: wordIds } },
      });
      await prisma.session.deleteMany({ where: { userId } });
    }
  });

  it('ignores priority words when includePriority is false', async () => {
    expect(wordIds.length).toBeGreaterThanOrEqual(1);
    const priorityWordId = wordIds[0];
    if (!priorityWordId) throw new Error('wordIds missing');

    try {
      await prisma.userWordPriority.create({
        data: { userId, wordId: priorityWordId },
      });
      // Прогресс вручную: fresh-запрос (§33) исключает слова с прогрессом,
      // иначе приоритетное слово могло бы вернуться обычной карточкой
      // (порядок fresh по createdAt — детерминированность теста).
      await prisma.userWordProgress.create({
        data: { userId, wordId: priorityWordId, state: 'new', dueDate: new Date() },
      });

      const session = await startSession(
        userId,
        StartSessionSchema.parse({
          cardLimit: 5,
          includeNew: true,
          includePriority: false,
          mode: 'learn',
          practiceType: 'flip-card',
        }),
      );

      const first = firstWordId(session as { cards: CardWithWord[] });
      expect(first).not.toBe(priorityWordId);
    } finally {
      await prisma.userWordPriority.deleteMany({
        where: { userId, wordId: priorityWordId },
      });
      await prisma.userWordProgress.deleteMany({
        where: { userId, wordId: { in: wordIds } },
      });
      await prisma.session.deleteMany({ where: { userId } });
    }
  });
});
