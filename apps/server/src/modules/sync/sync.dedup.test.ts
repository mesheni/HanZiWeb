import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { recordAnswer } from '../sessions/sessions.service.js';
import { processSync } from './sync.service.js';
import type { SyncRequest } from '@hanzi/shared';

// Гонка live-post ↔ офлайн-flush (fix v0.4 §45 follow-up): ответ должен
// применяться ровно один раз при любом порядке доставки.
//
// Клиент штампует `answeredAt` один раз и использует его и в live-post,
// и в payload очереди. Сервер ставит `lastReviewDate` = серверное время
// (F04), поэтому дедуп `changeTime <= existingTime` отбрасывает flush
// после успешного live-post (T1 <= серверное время). Если flush пришёл
// с более поздним timestamp — срабатывает страховка findFirst по
// (sessionId, wordId), а уникальный индекс SessionAnswer — финальная
// защита на уровне БД. Все пропуски возвращают терминальный ack (F05).
//
// F06: конкурентные flush обрабатываются в транзакции с CAS-записью
// (stability/reps как «версия») — проигравший перечитывает и получает
// ack, потерянных обновлений нет.

const testRunId = Date.now();
let userId = '';
let wordId = '';
let sessionId = '';

async function createUser(): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `dedup-${testRunId}-${Math.random().toString(36).slice(2, 6)}@hanzi.local` },
  });
  return u.id;
}

async function createWord(): Promise<string> {
  const w = await prisma.word.create({
    data: {
      character: `字${testRunId}-${Math.random().toString(36).slice(2, 6)}`,
      pinyin: 'zì',
      translation: 'character',
    },
  });
  return w.id;
}

async function createSession(uid: string): Promise<string> {
  const s = await prisma.session.create({
    data: { userId: uid, cardsTotal: 1, mode: 'mixed', practiceType: 'flip-card' },
  });
  return s.id;
}

async function createProgress(uid: string, wid: string): Promise<void> {
  await prisma.userWordProgress.create({
    data: { userId: uid, wordId: wid, state: 'new', dueDate: new Date() },
  });
}

function mkSyncRequest(wid: string, sid: string, timestamp: string, changeId = 'c1'): SyncRequest {
  return {
    changes: [
      {
        id: changeId,
        type: 'study_answer',
        payload: { wordId: wid, rating: 3, timestamp, sessionId: sid },
      },
    ],
  };
}

describe('sync dedup — live-post + offline flush applies once (fix v0.4 §45 follow-up)', () => {
  beforeAll(async () => {
    userId = await createUser();
    wordId = await createWord();
    sessionId = await createSession(userId);
    await createProgress(userId, wordId);
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (wordId) await prisma.word.deleteMany({ where: { id: wordId } });
  });

  it('live-post применился (T1), flush догоняет с тем же timestamp → reps ровно 1', async () => {
    const answeredAt = new Date().toISOString();

    // Live-post применяется (lastReviewDate = серверное время ≈ T1).
    const live = await recordAnswer(userId, {
      sessionId,
      wordId,
      rating: 3,
      answeredAt,
    });
    expect(live.xpGain).toBe(3);

    // Fallback-очередь flush'ится с тем же timestamp (T1 === T2).
    const sync = await processSync(userId, mkSyncRequest(wordId, sessionId, answeredAt));

    // F05: дедуп `changeTime <= existingTime` отбросил повторный apply,
    // но терминальный ack (stale) пришёл — иначе pending живёт вечно.
    expect(sync.results).toHaveLength(1);
    expect(sync.results[0]?.outcome).toBe('stale');

    const progress = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });
    expect(progress?.reps).toBe(1);

    const answers = await prisma.sessionAnswer.findMany({ where: { sessionId, wordId } });
    expect(answers).toHaveLength(1);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.xp).toBe(3);
  });

  it('flush с более поздним timestamp после live-post → страховка findFirst по (sessionId, wordId)', async () => {
    const before = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });
    const repsBefore = before?.reps ?? 0;

    // Тот же ответ, но очередь штампанула более поздний timestamp
    // (старый клиент / разнесённые часы): дедуп по времени не
    // срабатывает, но SessionAnswer для (sessionId, wordId) уже
    // существует → пропуск с ack duplicate (F05).
    const lateTs = new Date(Date.now() + 60_000).toISOString();
    const sync = await processSync(userId, mkSyncRequest(wordId, sessionId, lateTs, 'c2'));

    expect(sync.results).toHaveLength(1);
    expect(sync.results[0]?.outcome).toBe('duplicate');

    const progress = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });
    expect(progress?.reps).toBe(repsBefore);
    expect(progress?.lastReviewDate?.toISOString()).not.toBe(lateTs);

    const answers = await prisma.sessionAnswer.findMany({ where: { sessionId, wordId } });
    expect(answers).toHaveLength(1);
  });

  it('чисто офлайн-ответ: flush применяет ровно один раз, повторный flush с тем же timestamp пропускается', async () => {
    const uid = await createUser();
    const wid = await createWord();
    const sid = await createSession(uid);
    await createProgress(uid, wid);

    try {
      const timestamp = new Date().toISOString();
      const req = mkSyncRequest(wid, sid, timestamp);

      const first = await processSync(uid, req);
      expect(first.results).toHaveLength(1);
      expect(first.results[0]?.outcome).toBe('applied');
      expect(first.results[0]?.xpGain).toBe(3);

      const progress = await prisma.userWordProgress.findUnique({
        where: { userId_wordId: { userId: uid, wordId: wid } },
      });
      expect(progress?.reps).toBe(1);
      // F04: lastReviewDate — серверное время, не клиентский timestamp.
      expect(Math.abs(progress!.lastReviewDate!.getTime() - Date.now())).toBeLessThan(60_000);

      // Повторный flush того же изменения (retry сети) — пропуск с ack (F05).
      const second = await processSync(uid, req);
      expect(second.results).toHaveLength(1);
      expect(second.results[0]?.outcome).toBe('stale');

      const after = await prisma.userWordProgress.findUnique({
        where: { userId_wordId: { userId: uid, wordId: wid } },
      });
      expect(after?.reps).toBe(1);

      const user = await prisma.user.findUnique({ where: { id: uid } });
      expect(user?.xp).toBe(3);
    } finally {
      await prisma.user.deleteMany({ where: { id: uid } });
      await prisma.word.deleteMany({ where: { id: wid } });
    }
  });

  it('live-дубль (retry после ложной сетевой ошибки) → P2002 ловится, идемпотентный ответ без второго пересчёта', async () => {
    const uid = await createUser();
    const wid = await createWord();
    const sid = await createSession(uid);
    await createProgress(uid, wid);

    try {
      const answeredAt = new Date().toISOString();

      const first = await recordAnswer(uid, {
        sessionId: sid,
        wordId: wid,
        rating: 3,
        answeredAt,
      });
      expect(first.xpGain).toBe(3);

      // Клиент не увидел ответ и повторил live-post с тем же answeredAt.
      const second = await recordAnswer(uid, {
        sessionId: sid,
        wordId: wid,
        rating: 3,
        answeredAt,
      });
      // Идемпотентный ответ: прогресс уже пересчитан первым запросом.
      expect(second.xpGain).toBe(0);

      const progress = await prisma.userWordProgress.findUnique({
        where: { userId_wordId: { userId: uid, wordId: wid } },
      });
      expect(progress?.reps).toBe(1);

      const answers = await prisma.sessionAnswer.findMany({ where: { sessionId: sid, wordId: wid } });
      expect(answers).toHaveLength(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: uid } });
      await prisma.word.deleteMany({ where: { id: wid } });
    }
  });

  it('F06: два конкурентных flush одного изменения → ровно один apply, второй получает терминальный ack', async () => {
    const uid = await createUser();
    const wid = await createWord();
    const sid = await createSession(uid);
    await createProgress(uid, wid);

    try {
      const timestamp = new Date().toISOString();
      const req = mkSyncRequest(wid, sid, timestamp, 'race-1');

      // Оба flush стартуют одновременно — до фикса оба читали прогресс
      // вне транзакции и могли оба пересчитать FSRS от одного состояния.
      const [a, b] = await Promise.all([processSync(uid, req), processSync(uid, req)]);

      const outcomes = [...a.results, ...b.results].map((r) => r.outcome);
      // Ровно один применён; второй получил терминальный ack (stale/duplicate).
      expect(outcomes.filter((o) => o === 'applied')).toHaveLength(1);
      expect(outcomes.filter((o) => o !== 'applied')).toHaveLength(1);

      const progress = await prisma.userWordProgress.findUnique({
        where: { userId_wordId: { userId: uid, wordId: wid } },
      });
      expect(progress?.reps).toBe(1);

      const answers = await prisma.sessionAnswer.findMany({ where: { sessionId: sid } });
      expect(answers).toHaveLength(1);

      const user = await prisma.user.findUnique({ where: { id: uid } });
      expect(user?.xp).toBe(3);
    } finally {
      await prisma.user.deleteMany({ where: { id: uid } });
      await prisma.word.deleteMany({ where: { id: wid } });
    }
  });
});
