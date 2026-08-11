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

    // F33: слова создаём сами — тест не зависит от HSK-сидов dev-БД
    // (интеграционные тесты идут в изолированную тестовую БД).
    // createdAt растёт, поэтому первое созданное слово — «старейшее».
    const mk = (char: string) =>
      prisma.word.create({
        data: { character: char, pinyin: 'x', translation: 'x', hskLevel: 1 },
      });
    progressedWordId = (await mk(`鲜${Date.now()}a`)).id;
    freshWordId = (await mk(`鲜${Date.now()}b`)).id;

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
    await prisma.word.deleteMany({
      where: { id: { in: [progressedWordId, freshWordId] } },
    });
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
