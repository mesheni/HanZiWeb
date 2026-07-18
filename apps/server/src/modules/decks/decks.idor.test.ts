import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';
import {
  listDecksForUser,
  getDeckWithWordsForUser,
  subscribeToDeck,
} from './decks.service.js';
import { decksRoutes } from './decks.routes.js';

const testRunId = Date.now();
let ownerId = '';
let attackerId = '';
let otherUserId = '';
let ownerDeckId = '';
let attackerDeckId = '';
let systemDeckId = '';
let wordId = '';

async function createUser(suffix: string): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `decks-${testRunId}-${suffix}@hanzi.local` },
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

async function createCustomDeck(
  userId: string,
  name: string,
  shareCode: string | null = null,
): Promise<string> {
  const d = await prisma.deck.create({
    data: {
      name,
      description: null,
      isSystemDeck: false,
      ownerId: userId,
      shareCode,
    },
  });
  return d.id;
}

async function createSystemDeck(name: string): Promise<string> {
  const d = await prisma.deck.create({
    data: {
      name,
      description: null,
      isSystemDeck: true,
      ownerId: null,
    },
  });
  return d.id;
}

async function createWord(): Promise<string> {
  return (
    await prisma.word.create({
      data: {
        character: `字${testRunId}-${Math.random()}`,
        pinyin: 'zì',
        translation: 'symbol',
      },
    })
  ).id;
}

async function addWordToDeck(deckId: string, wordIdValue: string): Promise<void> {
  await prisma.deckWord.create({
    data: { deckId, wordId: wordIdValue },
  });
}

describe('decks — IDOR fix (PLAN_Features_v0.4 §23)', () => {
  beforeAll(async () => {
    ownerId = await createUser('owner');
    attackerId = await createUser('attacker');
    otherUserId = await createUser('other');
    wordId = await createWord();

    ownerDeckId = await createCustomDeck(ownerId, `My Deck ${testRunId}`);
    attackerDeckId = await createCustomDeck(attackerId, `Attacker Deck ${testRunId}`);
    systemDeckId = await createSystemDeck(`HSK1 ${testRunId}`);

    await addWordToDeck(ownerDeckId, wordId);
    await addWordToDeck(attackerDeckId, wordId);
    await addWordToDeck(systemDeckId, wordId);
  });

  afterAll(async () => {
    if (ownerDeckId) await prisma.deck.deleteMany({ where: { id: ownerDeckId } });
    if (attackerDeckId) await prisma.deck.deleteMany({ where: { id: attackerDeckId } });
    if (systemDeckId) await prisma.deck.deleteMany({ where: { id: systemDeckId } });
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
    if (attackerId) await prisma.user.deleteMany({ where: { id: attackerId } });
    if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
  });

  // ─── Service layer: listDecksForUser ─────────────────────────────

  it('listDecksForUser: владелец видит свои + системные, не видит чужие кастомные', async () => {
    const decks = await listDecksForUser(ownerId);
    const ids = decks.map((d) => d.id);
    expect(ids).toContain(ownerDeckId);   // своя — видна
    expect(ids).toContain(systemDeckId);  // системная — видна
    expect(ids).not.toContain(attackerDeckId); // чужая — НЕ видна
  });

  it('listDecksForUser: каждый видит только свой набор (нет утечки между юзерами)', async () => {
    const ownerDecks = await listDecksForUser(ownerId);
    const attackerDecks = await listDecksForUser(attackerId);
    // Владелец НЕ видит чужую приватную (был баг — listDecks возвращал ВСЕ).
    expect(ownerDecks.map((d) => d.id)).not.toContain(attackerDeckId);
    // И наоборот.
    expect(attackerDecks.map((d) => d.id)).not.toContain(ownerDeckId);
    // Оба видят системную.
    expect(ownerDecks.map((d) => d.id)).toContain(systemDeckId);
    expect(attackerDecks.map((d) => d.id)).toContain(systemDeckId);
  });

  // ─── Service layer: getDeckWithWordsForUser ─────────────────────

  it('getDeckWithWordsForUser: владелец получает свою колоду', async () => {
    const deck = await getDeckWithWordsForUser(ownerDeckId, ownerId);
    expect(deck).not.toBeNull();
    expect(deck!.id).toBe(ownerDeckId);
    expect(deck!.wordIds).toContain(wordId);
  });

  it('getDeckWithWordsForUser: чужой пользователь получает null (а не 403)', async () => {
    // Намеренно null, чтобы не утекало существование приватной колоды.
    const deck = await getDeckWithWordsForUser(ownerDeckId, attackerId);
    expect(deck).toBeNull();
  });

  it('getDeckWithWordsForUser: системную колоду видит любой', async () => {
    const deck = await getDeckWithWordsForUser(systemDeckId, attackerId);
    expect(deck).not.toBeNull();
    expect(deck!.isSystemDeck).toBe(true);
  });

  // ─── Service layer: subscribeToDeck ─────────────────────────────

  it('subscribeToDeck: подписка на системную колоду работает', async () => {
    // Создаём свежего юзера без своего прогресса по этому слову.
    const res = await subscribeToDeck(otherUserId, systemDeckId);
    expect(res.wordsAdded).toBe(1);
  });

  it('subscribeToDeck: подписка на чужую приватную колоду → 403', async () => {
    let caught: { statusCode?: number; code?: string } | null = null;
    try {
      await subscribeToDeck(attackerId, ownerDeckId);
    } catch (e) {
      caught = e as { statusCode?: number; code?: string };
    }
    expect(caught).not.toBeNull();
    expect(caught?.statusCode).toBe(403);
    expect(caught?.code).toBe('FORBIDDEN');
  });

  it('subscribeToDeck: подписка на несуществующую колоду → 404', async () => {
    let caught: { statusCode?: number; code?: string } | null = null;
    try {
      await subscribeToDeck(attackerId, '00000000-0000-0000-0000-000000000000');
    } catch (e) {
      caught = e as { statusCode?: number; code?: string };
    }
    expect(caught).not.toBeNull();
    expect(caught?.statusCode).toBe(404);
    expect(caught?.code).toBe('NOT_FOUND');
  });

  it('subscribeToDeck: подписка на СВОЮ кастомную колоду работает (regression)', async () => {
    const res = await subscribeToDeck(ownerId, ownerDeckId);
    expect(res.wordsAdded).toBeGreaterThanOrEqual(1);
  });

  // ─── Route layer: GET / требует auth ────────────────────────────

  it('route: GET /decks без токена → 401', async () => {
    const app = Fastify({ logger: false });
    await app.register(authPlugin);
    await app.register(decksRoutes, { prefix: '/decks' });
    try {
      const res = await app.inject({ method: 'GET', url: '/decks' });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('route: GET /decks владельца НЕ содержит чужую приватную колоду', async () => {
    const app = Fastify({ logger: false });
    await app.register(authPlugin);
    await app.register(decksRoutes, { prefix: '/decks' });
    try {
      const token = await issueAccessToken(ownerId);
      const res = await app.inject({
        method: 'GET',
        url: '/decks',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const ids: string[] = body.data.map((d: { id: string }) => d.id);
      expect(ids).toContain(ownerDeckId);
      expect(ids).toContain(systemDeckId);
      expect(ids).not.toContain(attackerDeckId);
    } finally {
      await app.close();
    }
  });

  it('route: GET /decks/:id чужой приватной → 404 (не 403, чтобы не утекало существование)', async () => {
    const app = Fastify({ logger: false });
    await app.register(authPlugin);
    await app.register(decksRoutes, { prefix: '/decks' });
    try {
      const token = await issueAccessToken(attackerId);
      const res = await app.inject({
        method: 'GET',
        url: `/decks/${ownerDeckId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('route: GET /decks/:id системной колоды → 200 (она публичная)', async () => {
    const app = Fastify({ logger: false });
    await app.register(authPlugin);
    await app.register(decksRoutes, { prefix: '/decks' });
    try {
      const token = await issueAccessToken(attackerId);
      const res = await app.inject({
        method: 'GET',
        url: `/decks/${systemDeckId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
