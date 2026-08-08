import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';
import { getStudyMap } from '../stats/stats.service.js';
import { listWords } from '../words/words.service.js';
import { startSession } from '../sessions/sessions.service.js';
import { wordsRoutes } from '../words/words.routes.js';

/**
 * Регрессия F02 (plan-features-v0-6-ru): цепочка IDOR приватных колод
 * study-map → words?deckId → sessions.start. Любой залогиненный мог
 * выгрузить чужую приватную колоду: study-map отдавал ВСЕ колоды,
 * words?deckId и sessions.start фильтровали слова без проверки доступа.
 * Фикс: единый `deckAccessWhere` (системные — всем, кастомные — владельцу)
 * во всех трёх точках.
 */

const testRunId = Date.now();
let ownerId = '';
let attackerId = '';
let ownerDeckId = '';
let systemDeckId = '';
let wordId = '';

async function createUser(suffix: string): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `f02-${testRunId}-${suffix}@hanzi.local` },
  });
  return u.id;
}

async function issueAccessToken(userIdValue: string): Promise<string> {
  return jwt.sign(
    { userId: userIdValue, email: `${userIdValue}@x`, pv: 0 },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '5m' },
  );
}

const startInput = (deckIdValue: string) => ({
  deckId: deckIdValue,
  mode: 'mixed' as const,
  practiceType: 'flip-card' as const,
  cardLimit: 20,
  includeNew: true,
});

describe('F02 — IDOR приватных колод (study-map → words → sessions)', () => {
  beforeAll(async () => {
    ownerId = await createUser('owner');
    attackerId = await createUser('attacker');

    wordId = (
      await prisma.word.create({
        data: {
          character: `私${testRunId}`,
          pinyin: 'sī',
          translation: 'private',
        },
      })
    ).id;

    ownerDeckId = (
      await prisma.deck.create({
        data: { name: `Owner Private ${testRunId}`, isSystemDeck: false, ownerId },
      })
    ).id;
    systemDeckId = (
      await prisma.deck.create({
        data: { name: `HSK1 F02 ${testRunId}`, isSystemDeck: true, ownerId: null },
      })
    ).id;

    await prisma.deckWord.createMany({
      data: [
        { deckId: ownerDeckId, wordId },
        { deckId: systemDeckId, wordId },
      ],
    });
  });

  afterAll(async () => {
    await prisma.deck.deleteMany({ where: { id: { in: [ownerDeckId, systemDeckId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, attackerId] } } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
  });

  // ─── Звено 1: study-map ──────────────────────────────────────────

  it('study-map: чужая приватная колода не попадает в карту изучения', async () => {
    const map = await getStudyMap(attackerId);
    const ids = map.decks.map((d) => d.deckId);
    expect(ids).toContain(systemDeckId);
    expect(ids).not.toContain(ownerDeckId);
  });

  it('study-map: владелец видит свою приватную колоду (доступ не сломан)', async () => {
    const map = await getStudyMap(ownerId);
    const ids = map.decks.map((d) => d.deckId);
    expect(ids).toContain(ownerDeckId);
    expect(ids).toContain(systemDeckId);
  });

  // ─── Звено 2: words?deckId ───────────────────────────────────────

  it('words?deckId (service): атакующий не получает слова чужой приватной колоды', async () => {
    const result = await listWords({ deckId: ownerDeckId, limit: 50, offset: 0 }, attackerId);
    expect(result.data.map((w) => w.id)).not.toContain(wordId);
  });

  it('words?deckId (service): аноним (без userId) тоже не получает слова чужой колоды', async () => {
    const result = await listWords({ deckId: ownerDeckId, limit: 50, offset: 0 });
    expect(result.data.map((w) => w.id)).not.toContain(wordId);
  });

  it('words?deckId (service): владелец по-прежнему видит слова своей колоды', async () => {
    const result = await listWords({ deckId: ownerDeckId, limit: 50, offset: 0 }, ownerId);
    expect(result.data.map((w) => w.id)).toContain(wordId);
  });

  it('route: GET /words?deckId чужой приватной → 200 без её слов (атака с токеном)', async () => {
    const app = Fastify({ logger: false });
    await app.register(authPlugin);
    await app.register(wordsRoutes, { prefix: '/words' });
    try {
      const token = await issueAccessToken(attackerId);
      const res = await app.inject({
        method: 'GET',
        url: `/words?deckId=${ownerDeckId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.map((w: { id: string }) => w.id)).not.toContain(wordId);
    } finally {
      await app.close();
    }
  });

  it('route: GET /words?deckId своей колоды → 200 со словами', async () => {
    const app = Fastify({ logger: false });
    await app.register(authPlugin);
    await app.register(wordsRoutes, { prefix: '/words' });
    try {
      const token = await issueAccessToken(ownerId);
      const res = await app.inject({
        method: 'GET',
        url: `/words?deckId=${ownerDeckId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.map((w: { id: string }) => w.id)).toContain(wordId);
    } finally {
      await app.close();
    }
  });

  // ─── Звено 3: sessions.start ─────────────────────────────────────

  it('sessions.start: чужая приватная колода → 404 NOT_FOUND (не создаётся сессия)', async () => {
    let caught: { statusCode?: number; code?: string } | null = null;
    try {
      await startSession(attackerId, startInput(ownerDeckId));
    } catch (e) {
      caught = e as { statusCode?: number; code?: string };
    }
    expect(caught).not.toBeNull();
    expect(caught?.statusCode).toBe(404);
    expect(caught?.code).toBe('NOT_FOUND');
  });

  it('sessions.start: несуществующая колода → 404', async () => {
    let caught: { statusCode?: number; code?: string } | null = null;
    try {
      await startSession(attackerId, startInput('00000000-0000-0000-0000-000000000000'));
    } catch (e) {
      caught = e as { statusCode?: number; code?: string };
    }
    expect(caught).not.toBeNull();
    expect(caught?.statusCode).toBe(404);
  });

  it('sessions.start: владелец стартует сессию по своей колоде (доступ не сломан)', async () => {
    const session = await startSession(ownerId, startInput(ownerDeckId));
    expect(session.deckId).toBe(ownerDeckId);
    expect(session.deckName).toBe(`Owner Private ${testRunId}`);
    expect(session.cardsTotal).toBeGreaterThanOrEqual(1);
  });
});
