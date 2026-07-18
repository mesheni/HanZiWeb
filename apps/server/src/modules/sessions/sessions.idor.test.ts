import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { recordAnswer } from './sessions.service.js';

const testRunId = Date.now();
let ownerId = '';
let attackerId = '';
let ownerSessionId = '';
let attackerSessionId = '';
let wordId = '';

async function createUser(suffix: string): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `idor-${testRunId}-${suffix}@hanzi.local` },
  });
  return u.id;
}

async function createSession(userId: string, _suffix: string): Promise<string> {
  const s = await prisma.session.create({
    data: { userId, cardsTotal: 1, mode: 'mixed', practiceType: 'flip-card' },
  });
  return s.id;
}

async function createWord(): Promise<string> {
  const w = await prisma.word.create({
    data: { character: `字${testRunId}-${Math.random()}`, pinyin: 'zì', translation: 'symbol' },
  });
  return w.id;
}

async function createProgress(userId: string, wordId: string): Promise<void> {
  await prisma.userWordProgress.create({
    data: { userId, wordId, state: 'new', dueDate: new Date() },
  });
}

describe('recordAnswer — IDOR fix (PLAN_Features_v0.4 §20)', () => {
  beforeAll(async () => {
    ownerId = await createUser('owner');
    attackerId = await createUser('attacker');
    wordId = await createWord();
    await createProgress(ownerId, wordId);
    await createProgress(attackerId, wordId);
    ownerSessionId = await createSession(ownerId, 'owner');
    attackerSessionId = await createSession(attackerId, 'attacker');
  });

  afterAll(async () => {
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
    if (attackerId) await prisma.user.deleteMany({ where: { id: attackerId } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
  });

  it('attacker cannot record answer in another user\'s session (returns 404)', async () => {
    // До фикса: `findUnique({ where: { id } })` возвращал сессию владельца,
    // и `recordAnswer` радостно инкрементил `cardsCompleted` + создавал
    // `SessionAnswer` в чужой сессии (IDOR).
    // После фикса: `findFirst({ where: { id, userId } })` → null → 404.
    let caught: { statusCode?: number; code?: string } | null = null;
    try {
      await recordAnswer(attackerId, {
        sessionId: ownerSessionId,
        wordId,
        rating: 3,
      });
    } catch (e) {
      caught = e as { statusCode?: number; code?: string };
    }
    expect(caught).not.toBeNull();
    expect(caught?.statusCode).toBe(404);
    expect(caught?.code).toBe('NOT_FOUND');
  });

  it('owner can still record answer in their own session', async () => {
    // Регрессия: фикс не должен сломать легитимный сценарий.
    const result = await recordAnswer(ownerId, {
      sessionId: ownerSessionId,
      wordId,
      rating: 3,
    });
    expect(result.wordId).toBe(wordId);
    expect(result.xpGain).toBeGreaterThan(0);
  });

  it('attacker\'s own session is not affected (regression check)', async () => {
    // Подтверждаем, что атакующий может работать со СВОЕЙ сессией.
    const result = await recordAnswer(attackerId, {
      sessionId: attackerSessionId,
      wordId,
      rating: 4,
    });
    expect(result.wordId).toBe(wordId);
    expect(result.xpGain).toBe(5);
  });

  it('attacker cannot poison cardsCompleted counter of another user\'s session', async () => {
    // Проверяем именно тот эффект, что был в баге: количество
    // завершённых карточек в чужой сессии не должно измениться.
    const before = await prisma.session.findUnique({ where: { id: ownerSessionId } });
    expect(before).not.toBeNull();
    const cardsCompletedBefore = before!.cardsCompleted;

    let threw = false;
    try {
      await recordAnswer(attackerId, { sessionId: ownerSessionId, wordId, rating: 3 });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    const after = await prisma.session.findUnique({ where: { id: ownerSessionId } });
    expect(after!.cardsCompleted).toBe(cardsCompletedBefore);
  });
});
