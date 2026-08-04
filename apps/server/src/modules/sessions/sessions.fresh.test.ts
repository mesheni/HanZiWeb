import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StartSessionSchema } from '@hanzi/shared';
import { prisma } from '../../lib/prisma.js';
import { startSession } from './sessions.service.js';

// Проверка коррелированного subquery в подборе fresh-слов
// (PLAN_Features_v0.4 §33): слова с любой записью прогресса юзера
// исключаются без загрузки всех id в память.
const testEmail = `fresh-test-${Date.now()}@hanzi.local`;
let userId = '';
let progressedWordId = '';
let freshWordId = '';

interface CardWithWord {
  word: { id: string };
}

describe('startSession fresh words (PLAN_Features_v0.4 §33)', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: testEmail },
    });
    userId = user.id;

    // Два самых старых слова HSK1 по createdAt: fresh-запрос берёт
    // top-N в том же порядке, поэтому второе гарантированно попадёт
    // в сессию, а первое — нет (у него прогресс).
    const words = await prisma.word.findMany({
      where: { hskLevel: 1 },
      orderBy: [{ createdAt: 'asc' }],
      take: 2,
      select: { id: true },
    });
    progressedWordId = words[0]?.id ?? '';
    freshWordId = words[1]?.id ?? '';
    if (!progressedWordId || !freshWordId) throw new Error('need >=2 HSK1 words in seed');

    // Одна запись прогресса — «уже учится» и не должна попасть в fresh.
    await prisma.userWordProgress.create({
      data: { userId, wordId: progressedWordId, state: 'new', dueDate: new Date() },
    });
  });

  afterAll(async () => {
    if (userId) {
      await prisma.userWordProgress.deleteMany({ where: { userId } });
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it('excludes words that already have progress, still returns fresh ones', async () => {
    const session = await startSession(
      userId,
      StartSessionSchema.parse({
        cardLimit: 10,
        includeNew: true,
        mode: 'learn',
        practiceType: 'flip-card',
      }),
    );

    const seen = new Set(session.cards.map((c) => (c as CardWithWord).word.id));
    expect(seen.has(progressedWordId)).toBe(false);
    // Второе слово без прогресса должно попасть в learn-сессию.
    expect(seen.has(freshWordId)).toBe(true);
  });
});
