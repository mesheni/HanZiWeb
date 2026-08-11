import { describe, it, expect } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { processSync } from './sync.service.js';
import { recordAnswer } from '../sessions/sessions.service.js';
import type { SyncRequest } from '@hanzi/shared';

// F32: серверный журнал изменений — персистентный источник serverChanges.
// - applied (sync-путь и live-путь) пишет запись SyncJournal в той же
//   транзакции, что и обновление прогресса;
// - sinceCursor = монотонный id журнала, nextCursor — максимум пачки;
// - без курсора — полный снапшот + nextCursor на текущий максимум;
// - stale/duplicate/rejected журнал не растят.

const testRunId = Date.now();

async function createUser(): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `journal-${testRunId}-${Math.random().toString(36).slice(2, 6)}@hanzi.local` },
  });
  return u.id;
}

async function createWord(): Promise<string> {
  const w = await prisma.word.create({
    data: {
      character: `志${testRunId}-${Math.random().toString(36).slice(2, 6)}`,
      pinyin: 'zhì',
      translation: 'journal',
    },
  });
  return w.id;
}

function mkSyncRequest(wid: string, timestamp: string, changeId = 'c1'): SyncRequest {
  return {
    changes: [
      {
        id: changeId,
        type: 'study_answer',
        payload: { wordId: wid, rating: 3, timestamp },
      },
    ],
  };
}

describe('SyncJournal (F32)', () => {
  it('applied через sync пишет запись журнала с payload ServerChange-формы', async () => {
    const uid = await createUser();
    const wid = await createWord();
    await prisma.userWordProgress.create({ data: { userId: uid, wordId: wid } });
    const t = new Date().toISOString();

    const res = await processSync(uid, mkSyncRequest(wid, t));
    expect(res.results[0]!.outcome).toBe('applied');

    const entries = await prisma.syncJournal.findMany({ where: { userId: uid } });
    expect(entries).toHaveLength(1);
    const payload = entries[0]!.payload as Record<string, unknown>;
    expect(entries[0]!.changeType).toBe('study_answer');
    expect(payload.wordId).toBe(wid);
    expect(payload.state).toBe('learning');
    expect(payload.reps).toBe(1);
    expect(typeof payload.stability).toBe('number');
    expect(typeof payload.dueDate).toBe('string');
  });

  it('live-ответ (recordAnswer) тоже пишет журнал', async () => {
    const uid = await createUser();
    const wid = await createWord();
    await prisma.userWordProgress.create({ data: { userId: uid, wordId: wid } });
    const session = await prisma.session.create({
      data: { userId: uid, cardsTotal: 5, mode: 'mixed', practiceType: 'flip-card' },
    });

    await recordAnswer(uid, {
      sessionId: session.id,
      wordId: wid,
      rating: 4,
      responseTimeMs: 100,
      answeredAt: new Date().toISOString(),
    });

    const entries = await prisma.syncJournal.findMany({ where: { userId: uid } });
    expect(entries).toHaveLength(1);
    expect((entries[0]!.payload as Record<string, unknown>).reps).toBe(1);
  });

  it('первый sync без курсора: полный снапшот + nextCursor = максимум журнала', async () => {
    const uid = await createUser();
    const wid = await createWord();
    await prisma.userWordProgress.create({ data: { userId: uid, wordId: wid, reps: 3 } });

    // live-ответ — журнал получает 1 запись, снапшот — 1 строка прогресса
    const session = await prisma.session.create({
      data: { userId: uid, cardsTotal: 5, mode: 'mixed', practiceType: 'flip-card' },
    });
    await recordAnswer(uid, {
      sessionId: session.id,
      wordId: wid,
      rating: 3,
      responseTimeMs: 100,
    });

    const res = await processSync(uid, { changes: [] });
    expect(res.serverChanges).toHaveLength(1);
    expect(res.serverChanges[0]!.wordId).toBe(wid);
    expect(res.serverChanges[0]!.reps).toBe(4);

    const maxId = await prisma.syncJournal.aggregate({
      where: { userId: uid },
      _max: { id: true },
    });
    expect(res.nextCursor).toBe(Number(maxId._max.id));
  });

  it('инкрементальный sync: после курсора — только новые записи журнала', async () => {
    const uid = await createUser();
    const wid = await createWord();
    await prisma.userWordProgress.create({ data: { userId: uid, wordId: wid } });

    // Первый sync — снапшот + курсор.
    const first = await processSync(uid, mkSyncRequest(wid, new Date().toISOString(), 'c1'));
    expect(first.results[0]!.outcome).toBe('applied');
    const cursor = first.nextCursor;

    // Сразу после — изменений нет.
    const second = await processSync(uid, { changes: [], sinceCursor: cursor });
    expect(second.serverChanges).toHaveLength(0);
    expect(second.nextCursor).toBe(cursor);

    // Ещё один applied-ответ → журнал растёт, курсор двигается.
    const third = await processSync(
      uid,
      mkSyncRequest(wid, new Date(Date.now() + 60_000).toISOString(), 'c2'),
    );
    expect(third.results[0]!.outcome).toBe('applied');
    const inc = await processSync(uid, { changes: [], sinceCursor: cursor });
    expect(inc.serverChanges).toHaveLength(1);
    expect(inc.serverChanges[0]!.reps).toBe(2);
    expect(inc.nextCursor).toBeGreaterThan(cursor);
  });

  it('stale/duplicate не растят журнал', async () => {
    const uid = await createUser();
    const wid = await createWord();
    await prisma.userWordProgress.create({ data: { userId: uid, wordId: wid } });
    const t = new Date().toISOString();

    await processSync(uid, mkSyncRequest(wid, t, 'c1'));
    const stale = await processSync(uid, mkSyncRequest(wid, t, 'c2'));
    expect(stale.results[0]!.outcome).toBe('stale');

    const count = await prisma.syncJournal.count({ where: { userId: uid } });
    expect(count).toBe(1);
  });

  it('разные пользователи изолированы в журнале', async () => {
    const uidA = await createUser();
    const uidB = await createUser();
    const wid = await createWord();
    await prisma.userWordProgress.create({ data: { userId: uidA, wordId: wid } });
    await prisma.userWordProgress.create({ data: { userId: uidB, wordId: wid } });

    await processSync(uidA, mkSyncRequest(wid, new Date().toISOString(), 'a1'));

    const resB = await processSync(uidB, { changes: [] });
    expect(resB.serverChanges).toHaveLength(1); // снапшот B — журнал пуст
    const entriesB = await prisma.syncJournal.findMany({ where: { userId: uidB } });
    expect(entriesB).toHaveLength(0);
  });
});
