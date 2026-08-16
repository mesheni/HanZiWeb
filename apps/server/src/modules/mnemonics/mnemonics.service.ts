import { prisma } from '../../lib/prisma.js';
import type { UserMnemonic } from '@hanzi/shared';

/** Лимит wordIds в пакетной выборке (защита от раздувания URL). */
const BATCH_LIMIT = 50;

function toDto(row: { wordId: string; text: string; updatedAt: Date }): UserMnemonic {
  return {
    wordId: row.wordId,
    text: row.text,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Пакетная выборка мнемоник по списку слов (для флеш-карт, палитры). */
export async function getMnemonics(userId: string, wordIdsCsv: string): Promise<UserMnemonic[]> {
  const wordIds = [
    ...new Set(
      wordIdsCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, BATCH_LIMIT);
  if (wordIds.length === 0) return [];
  const rows = await prisma.userWordMnemonic.findMany({
    where: { userId, wordId: { in: wordIds } },
  });
  return rows.map(toDto);
}

export async function upsertMnemonic(
  userId: string,
  wordId: string,
  text: string,
): Promise<UserMnemonic> {
  const updatedAt = new Date();
  const row = await prisma.userWordMnemonic.upsert({
    where: { userId_wordId: { userId, wordId } },
    create: { userId, wordId, text, updatedAt },
    update: { text, updatedAt },
  });
  return toDto(row);
}

/** Возвращает false, если записи не было (идемпотентное удаление). */
export async function deleteMnemonic(userId: string, wordId: string): Promise<boolean> {
  const deleted = await prisma.userWordMnemonic.deleteMany({
    where: { userId, wordId },
  });
  return deleted.count > 0;
}

/**
 * Применение офлайн-изменения мнемоники из sync-батча.
 * Last-write-wins по клиентскому `updatedAt`: более старое изменение
 * (например, догнавший flush с другого устройства) отбрасывается как
 * stale. Возвращает исход для ack-а клиенту.
 */
export async function applyMnemonicChange(
  userId: string,
  change:
    | { type: 'mnemonic_upsert'; payload: { wordId: string; text: string; updatedAt: string } }
    | { type: 'mnemonic_delete'; payload: { wordId: string; updatedAt: string } },
): Promise<'applied' | 'stale' | 'duplicate'> {
  const { wordId, updatedAt } = change.payload;
  const clientTime = new Date(updatedAt).getTime();

  const existing = await prisma.userWordMnemonic.findUnique({
    where: { userId_wordId: { userId, wordId } },
  });

  if (existing && existing.updatedAt.getTime() > clientTime) {
    return 'stale';
  }

  if (change.type === 'mnemonic_delete') {
    if (!existing) return 'duplicate';
    await prisma.userWordMnemonic.deleteMany({ where: { userId, wordId } });
    return 'applied';
  }

  await prisma.userWordMnemonic.upsert({
    where: { userId_wordId: { userId, wordId } },
    create: { userId, wordId, text: change.payload.text, updatedAt: new Date(clientTime) },
    update: { text: change.payload.text, updatedAt: new Date(clientTime) },
  });
  return 'applied';
}
