import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import * as mnemonicsService from './mnemonics.service.js';
import { processSync } from '../sync/sync.service.js';
import type { SyncRequest } from '@hanzi/shared';

// Личные мнемоники: CRUD + last-write-wins при офлайн-синхронизации.
// Тот же стиль, что sync.dedup.test.ts: реальные записи в БД с
// уникальным префиксом, чистим за собой.

const testRunId = Date.now();
let userId = '';
let wordId = '';
let otherUserId = '';

async function createUser(): Promise<string> {
  const u = await prisma.user.create({
    data: {
      email: `mnemo-${testRunId}-${Math.random().toString(36).slice(2, 6)}@hanzi.local`,
    },
  });
  return u.id;
}

async function createWord(): Promise<string> {
  const w = await prisma.word.create({
    data: {
      character: `记${testRunId}-${Math.random().toString(36).slice(2, 6)}`,
      pinyin: 'jì',
      translation: 'remember',
    },
  });
  return w.id;
}

function mnemonicChange(
  id: string,
  word: string,
  text: string | null,
  updatedAt: string,
): SyncRequest['changes'][number] {
  return text === null
    ? { id, type: 'mnemonic_delete', payload: { wordId: word, updatedAt } }
    : { id, type: 'mnemonic_upsert', payload: { wordId: word, text, updatedAt } };
}

beforeAll(async () => {
  userId = await createUser();
  otherUserId = await createUser();
  wordId = await createWord();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await prisma.word.deleteMany({ where: { id: wordId } });
});

describe('mnemonics service (v0.7)', () => {
  it('upsert + пакетная выборка', async () => {
    const saved = await mnemonicsService.upsertMnemonic(userId, wordId, 'первая ассоциация');
    expect(saved.text).toBe('первая ассоциация');

    const items = await mnemonicsService.getMnemonics(
      userId,
      `${wordId},00000000-0000-0000-0000-000000000000`,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.wordId).toBe(wordId);
  });

  it('мнемоники изолированы между пользователями', async () => {
    await mnemonicsService.upsertMnemonic(otherUserId, wordId, 'чужая ассоциация');
    const mine = await mnemonicsService.getMnemonics(userId, wordId);
    expect(mine[0]!.text).toBe('первая ассоциация');
  });

  it('delete — идемпотентен', async () => {
    expect(await mnemonicsService.deleteMnemonic(otherUserId, wordId)).toBe(true);
    expect(await mnemonicsService.deleteMnemonic(otherUserId, wordId)).toBe(false);
  });

  it('sync: upsert применяется, дубль по времени отбрасывается', async () => {
    // Фиксированные будущие даты — не зависят от реального «сейчас»:
    // t1 < t2 < t3 (t3 — delete в следующем тесте).
    const t1 = '2027-01-01T10:00:00.000Z';
    const t2 = '2027-01-02T10:00:00.000Z';

    const first = await processSync(userId, {
      changes: [mnemonicChange('m1', wordId, 'вторая ассоциация', t2)],
    });
    expect(first.results[0]).toMatchObject({ changeId: 'm1', outcome: 'applied', wordId });

    // Устаревшая правка (t1 < t2) — stale, не перезатирает новую.
    const stale = await processSync(userId, {
      changes: [mnemonicChange('m2', wordId, 'старая правка', t1)],
    });
    expect(stale.results[0]).toMatchObject({ changeId: 'm2', outcome: 'stale', wordId });

    const row = await prisma.userWordMnemonic.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });
    expect(row?.text).toBe('вторая ассоциация');
  });

  it('sync: delete отсутствующей записи — duplicate', async () => {
    const t3 = '2027-01-03T10:00:00.000Z';
    const t4 = '2027-01-04T10:00:00.000Z';

    const res = await processSync(userId, {
      changes: [mnemonicChange('m3', wordId, null, t3)],
    });
    // Запись существует после upsert выше — сначала удаляем через sync,
    // затем повторный delete должен дать duplicate.
    expect(res.results[0]).toMatchObject({ outcome: 'applied' });

    const again = await processSync(userId, {
      changes: [mnemonicChange('m4', wordId, null, t4)],
    });
    expect(again.results[0]).toMatchObject({ outcome: 'duplicate' });
  });
});
