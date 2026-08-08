import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import authPlugin from '../../plugins/auth.js';
import { prisma } from '../../lib/prisma.js';
import { decksRoutes } from './decks.routes.js';
import { wordsRoutes } from '../words/words.routes.js';

// F17: удаление слов и колод с FK-связями возвращало 500 — Prisma P2003
// (foreign key constraint) не маппился в глобальном error handler'е.
// Теперь: 409 CONFLICT («ресурс используется другими записями»).
// Слова: SessionAnswer.word (RESTRICT) реально блокирует удаление.
// Колоды: Session.deck — ON DELETE SET NULL, удаление безопасно.

const testRunId = Date.now();

async function issueAccessToken(id: string): Promise<string> {
  return jwt.sign({ userId: id, email: `${id}@x`, pv: 0 }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: '5m',
  });
}

/** Зеркало глобального error handler'а index.ts (включая P2003 из F17). */
async function buildTestApp(
  registerRoutes: (app: FastifyInstance) => Promise<void>,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }
    const err = error as { code?: unknown; statusCode?: unknown; message?: unknown };
    if (typeof err.code === 'string') {
      if (err.code === 'P2002') {
        return reply.status(409).send({
          success: false,
          error: { code: 'CONFLICT', message: 'Resource already exists' },
        });
      }
      if (err.code === 'P2003') {
        return reply.status(409).send({
          success: false,
          error: { code: 'CONFLICT', message: 'Resource is referenced by other records' },
        });
      }
    }
    if (typeof err.statusCode === 'number' && err.statusCode >= 400) {
      return reply.status(err.statusCode).send({
        success: false,
        error: {
          code: String(err.code ?? 'ERROR'),
          message: String(err.message ?? 'Request error'),
        },
      });
    }
    throw error;
  });
  await app.register(authPlugin);
  await registerRoutes(app);
  return app;
}

describe('DELETE /decks/:id с FK-связями → 409, без связей → 200 (F17)', () => {
  let userId = '';
  let deckWithSessionId = '';
  let deckFreeId = '';
  let wordId = '';
  let sessionId = '';

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `fk-deck-${testRunId}@hanzi.local`, role: 'USER' },
    });
    userId = u.id;
    wordId = (
      await prisma.word.create({
        data: { character: `删${testRunId}`, pinyin: 'shān', translation: 'delete' },
      })
    ).id;
    deckWithSessionId = (
      await prisma.deck.create({
        data: { name: `FK deck ${testRunId}`, isSystemDeck: false, ownerId: userId },
      })
    ).id;
    deckFreeId = (
      await prisma.deck.create({
        data: { name: `Free deck ${testRunId}`, isSystemDeck: false, ownerId: userId },
      })
    ).id;
    // Session ссылается на колоду: Session.deck без onDelete: Cascade →
    // удаление колоды упирается в FK.
    sessionId = (
      await prisma.session.create({
        data: {
          userId,
          deckId: deckWithSessionId,
          cardsTotal: 1,
          mode: 'mixed',
          practiceType: 'flip-card',
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (sessionId) await prisma.session.deleteMany({ where: { id: sessionId } });
    if (deckWithSessionId) await prisma.deck.deleteMany({ where: { id: deckWithSessionId } });
    if (deckFreeId) await prisma.deck.deleteMany({ where: { id: deckFreeId } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('колода с сессией удаляется: Session.deckId → null (F17, SetNull, не 500)', async () => {
    // Session.deck — опциональная связь: миграция создаёт
    // ON DELETE SET NULL, поэтому P2003 при удалении колоды не
    // возникает — сессия остаётся без колоды. Тест фиксирует это
    // контролируемое поведение (никакого 500).
    const app = await buildTestApp(async (a) => {
      await a.register(decksRoutes, { prefix: '/decks' });
    });
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'DELETE',
        url: `/decks/${deckWithSessionId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      expect(session?.deckId).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('колода без ссылающихся записей удаляется (200)', async () => {
    const app = await buildTestApp(async (a) => {
      await a.register(decksRoutes, { prefix: '/decks' });
    });
    try {
      const token = await issueAccessToken(userId);
      const res = await app.inject({
        method: 'DELETE',
        url: `/decks/${deckFreeId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(await prisma.deck.findUnique({ where: { id: deckFreeId } })).toBeNull();
    } finally {
      await app.close();
    }
  });
});

describe('DELETE /words/:id с FK-связями → 409, без связей → 200 (F17)', () => {
  let adminId = '';
  let wordWithAnswerId = '';
  let wordFreeId = '';
  let sessionId = '';

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { email: `fk-word-${testRunId}@hanzi.local`, role: 'ADMIN' },
    });
    adminId = admin.id;
    wordWithAnswerId = (
      await prisma.word.create({
        data: { character: `删词${testRunId}`, pinyin: 'shān cí', translation: 'delete word' },
      })
    ).id;
    wordFreeId = (
      await prisma.word.create({
        data: { character: `闲词${testRunId}`, pinyin: 'xián cí', translation: 'free word' },
      })
    ).id;
    // SessionAnswer ссылается на слово: SessionAnswer.word без
    // onDelete: Cascade → удаление слова упирается в FK.
    sessionId = (
      await prisma.session.create({
        data: { userId: adminId, cardsTotal: 1, mode: 'mixed', practiceType: 'flip-card' },
      })
    ).id;
    await prisma.sessionAnswer.create({
      data: { sessionId, wordId: wordWithAnswerId, rating: 3, answeredAt: new Date() },
    });
  });

  afterAll(async () => {
    if (sessionId) await prisma.session.deleteMany({ where: { id: sessionId } });
    if (wordWithAnswerId) await prisma.word.deleteMany({ where: { id: wordWithAnswerId } });
    if (wordFreeId) await prisma.word.deleteMany({ where: { id: wordFreeId } });
    if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
  });

  it('слово с ответами → 409 CONFLICT (не 500)', async () => {
    const app = await buildTestApp(async (a) => {
      await a.register(wordsRoutes, { prefix: '/words' });
    });
    try {
      const token = await issueAccessToken(adminId);
      const res = await app.inject({
        method: 'DELETE',
        url: `/words/${wordWithAnswerId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().success).toBe(false);
      expect(res.json().error.code).toBe('CONFLICT');
    } finally {
      await app.close();
    }
  });

  it('слово без ссылающихся записей удаляется (200)', async () => {
    const app = await buildTestApp(async (a) => {
      await a.register(wordsRoutes, { prefix: '/words' });
    });
    try {
      const token = await issueAccessToken(adminId);
      const res = await app.inject({
        method: 'DELETE',
        url: `/words/${wordFreeId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(await prisma.word.findUnique({ where: { id: wordFreeId } })).toBeNull();
    } finally {
      await app.close();
    }
  });
});
