import { describe, it, expect, vi } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { processSync } from './sync.service.js';
import { recalcFsrs } from '../sessions/srs.js';
import * as achievementsService from '../achievements/achievements.service.js';
import { getLocalDayKey } from '../stats/stats.service.js';
import type { SyncRequest } from '@hanzi/shared';

// Офлайн-путь /sync (PLANCorrection #15, #16, F04, F05):
// - FSRS-elapsed считается от payload.timestamp (момента ОТВЕТА), а не от
//   момента flush — retrievability совпадает с live-путём;
// - офлайн-ответ создаёт SessionAnswer, инкрементит Session.cardsCompleted
//   и бампает User.lastActiveDate (heatmap/стрик/ачивки видят офлайн-учёбу);
// - сессия из payload обязана принадлежать юзеру (IDOR-защита, как в
//   recordAnswer): чужая сессия не получает ответов и не инкрементится;
// - F04: lastReviewDate / SessionAnswer.answeredAt / lastActiveDate —
//   серверное время (клиентский timestamp только для elapsed);
// - F05: каждый вход получает терминальный ack (results[].outcome).

const testRunId = Date.now();
const nowToleranceMs = 60_000;

async function createUser(lastActiveDate: Date | null = null): Promise<string> {
  const u = await prisma.user.create({
    data: {
      email: `offline-${testRunId}-${Math.random().toString(36).slice(2, 6)}@hanzi.local`,
      lastActiveDate,
    },
  });
  return u.id;
}

async function createWord(): Promise<string> {
  const w = await prisma.word.create({
    data: {
      character: `离${testRunId}-${Math.random().toString(36).slice(2, 6)}`,
      pinyin: 'lí',
      translation: 'offline',
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

describe('processSync — offline answers (PLANCorrection #15, #16)', () => {
  it('elapsed считается от payload.timestamp, а не от момента flush', async () => {
    const uid = await createUser();
    const wid = await createWord();
    const sid = await createSession(uid);
    await prisma.userWordProgress.create({
      data: {
        userId: uid,
        wordId: wid,
        state: 'review',
        stability: 5,
        difficulty: 5,
        reps: 1,
        dueDate: new Date(),
        lastReviewDate: new Date('2026-07-12T00:00:00.000Z'),
      },
    });

    try {
      // Ответ «сделан» ровно через сутки после последнего повторения
      // (2026-07-13T00:00Z), flush пришёл сейчас. До фикса elapsed
      // считался от Date.now() (момента sync) → ~4 дня вместо 1.
      const answeredAt = new Date('2026-07-13T00:00:00.000Z');
      const res = await processSync(uid, mkSyncRequest(wid, sid, answeredAt.toISOString()));

      expect(res.results).toHaveLength(1);
      expect(res.results[0]?.outcome).toBe('applied');
      const expected = recalcFsrs(3, 5, 5, 'review', 1);
      expect(res.results[0]?.newStability).toBe(expected.newStability);

      const progress = await prisma.userWordProgress.findUnique({
        where: { userId_wordId: { userId: uid, wordId: wid } },
      });
      // F04: lastReviewDate — серверное время, а не клиентский timestamp.
      expect(Math.abs(progress!.lastReviewDate!.getTime() - Date.now())).toBeLessThan(
        nowToleranceMs,
      );
      expect(progress?.reps).toBe(2);
    } finally {
      await prisma.user.deleteMany({ where: { id: uid } });
      await prisma.word.deleteMany({ where: { id: wid } });
    }
  });

  it('офлайн-ответ: SessionAnswer + cardsCompleted + lastActiveDate + checkAllAchievements', async () => {
    const uid = await createUser(null);
    const wid = await createWord();
    const sid = await createSession(uid);
    await prisma.userWordProgress.create({
      data: { userId: uid, wordId: wid, state: 'new', dueDate: new Date() },
    });
    const timestamp = new Date('2026-07-15T10:00:00.000Z');
    const achSpy = vi
      .spyOn(achievementsService, 'checkAllAchievements')
      .mockResolvedValue([] as never);

    try {
      const res = await processSync(uid, mkSyncRequest(wid, sid, timestamp.toISOString()));
      expect(res.results).toHaveLength(1);

      // Heatmap-сырьё: SessionAnswer с answeredAt = серверное время (F04).
      const answers = await prisma.sessionAnswer.findMany({
        where: { sessionId: sid, wordId: wid },
      });
      expect(answers).toHaveLength(1);
      expect(Math.abs(answers[0]!.answeredAt.getTime() - Date.now())).toBeLessThan(nowToleranceMs);

      const session = await prisma.session.findUnique({ where: { id: sid } });
      expect(session?.cardsCompleted).toBe(1);

      // Стрик-якорь: lastActiveDate = сегодня в локальном дне юзера (F04/F12 —
      // серверное время; якорь локальной полуночи, как в getUserStreak).
      const user = await prisma.user.findUnique({ where: { id: uid } });
      expect(getLocalDayKey(user!.lastActiveDate!, 'UTC')).toBe(getLocalDayKey(new Date(), 'UTC'));

      // Ачивки проверяются best-effort по сессии с записанным ответом.
      expect(achSpy).toHaveBeenCalledTimes(1);
      expect(achSpy).toHaveBeenCalledWith(uid, sid);
    } finally {
      achSpy.mockRestore();
      await prisma.user.deleteMany({ where: { id: uid } });
      await prisma.word.deleteMany({ where: { id: wid } });
    }
  });

  it('lastActiveDate не откатывается назад, если был позже (max-семантика)', async () => {
    const uid = await createUser(new Date('2026-07-20T00:00:00.000Z'));
    const wid = await createWord();
    const sid = await createSession(uid);
    await prisma.userWordProgress.create({
      data: { userId: uid, wordId: wid, state: 'new', dueDate: new Date() },
    });

    try {
      // Офлайн-ответ «старше» уже записанной активности. F04: записывается
      // серверное «сейчас» (сегодня), которое не может быть раньше
      // существующего lastActiveDate — отката назад нет.
      const older = new Date('2026-07-15T10:00:00.000Z');
      const res = await processSync(uid, mkSyncRequest(wid, sid, older.toISOString()));
      expect(res.results).toHaveLength(1);

      const user = await prisma.user.findUnique({ where: { id: uid } });
      expect(getLocalDayKey(user!.lastActiveDate!, 'UTC')).toBe(getLocalDayKey(new Date(), 'UTC'));
    } finally {
      await prisma.user.deleteMany({ where: { id: uid } });
      await prisma.word.deleteMany({ where: { id: wid } });
    }
  });

  it('sessionId чужой сессии: прогресс применяется, чужая сессия не трогается (IDOR)', async () => {
    const attacker = await createUser(null);
    const victim = await createUser(null);
    const wid = await createWord();
    const victimSession = await createSession(victim);
    await prisma.userWordProgress.create({
      data: { userId: attacker, wordId: wid, state: 'new', dueDate: new Date() },
    });
    const timestamp = new Date('2026-07-15T10:00:00.000Z');

    try {
      const res = await processSync(
        attacker,
        mkSyncRequest(wid, victimSession, timestamp.toISOString()),
      );
      // Свой прогресс применён.
      expect(res.results).toHaveLength(1);
      const progress = await prisma.userWordProgress.findUnique({
        where: { userId_wordId: { userId: attacker, wordId: wid } },
      });
      expect(progress?.reps).toBe(1);

      // В чужую сессию ничего не записано.
      const victimAnswers = await prisma.sessionAnswer.findMany({
        where: { sessionId: victimSession, wordId: wid },
      });
      expect(victimAnswers).toHaveLength(0);
      const victimRow = await prisma.session.findUnique({ where: { id: victimSession } });
      expect(victimRow?.cardsCompleted).toBe(0);

      // Собственная активность атакующего всё равно засчитана (серверное время).
      const attackerUser = await prisma.user.findUnique({ where: { id: attacker } });
      expect(getLocalDayKey(attackerUser!.lastActiveDate!, 'UTC')).toBe(
        getLocalDayKey(new Date(), 'UTC'),
      );
    } finally {
      await prisma.user.deleteMany({ where: { id: attacker } });
      await prisma.user.deleteMany({ where: { id: victim } });
      await prisma.word.deleteMany({ where: { id: wid } });
    }
  });
});
