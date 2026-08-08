import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import type { Word, WordListItem } from '@hanzi/shared';
import { WORDS_SCHEMA, type DbCollections } from './database';
import { cacheWordFull, cacheWordListItems } from './wordsCache';

/**
 * F20: list-ответы (WordListItem) не должны перезаписывать rich-поля
 * (audioUrl, mnemonic, examples, tags) и createdAt полных слов,
 * уже лежащих в офлайн-кэше RxDB.
 */

const FULL_WORD: Word = {
  id: '11111111-1111-4111-8111-111111111111',
  character: '喜欢',
  pinyin: 'xǐ huān',
  translation: 'нравиться, любить',
  hskLevel: 1,
  audioUrl: 'https://cdn.example.com/audio/xihuan.mp3',
  mnemonic: '女 + 子 → нравится',
  createdAt: '2026-01-01T00:00:00.000Z',
  examples: [
    {
      id: 'e1',
      wordId: '11111111-1111-4111-8111-111111111111',
      chinese: '我喜欢你',
      russian: 'Я тебя люблю',
      source: 'manual',
      tatoebaId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  tags: [
    {
      id: 't1',
      name: 'частое',
      slug: 'frequent',
      color: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

function listItem(id: string, overrides: Partial<WordListItem> = {}): WordListItem {
  return {
    id,
    character: '喜欢',
    pinyin: 'xǐ huān',
    translation: 'нравиться',
    hskLevel: 1,
    ...overrides,
  };
}

// Каждый тест получает базу с уникальным именем — без гонок на
// удалении общего IndexedDB 'hanzi' между тестами.
let dbSeq = 0;
async function makeTestDb(): Promise<RxDatabase<DbCollections>> {
  const db = await createRxDatabase<DbCollections>({
    name: `hanzi-test-${dbSeq++}`,
    storage: getRxStorageDexie(),
  } as any);
  await db.addCollections({
    words: { schema: WORDS_SCHEMA },
  });
  return db;
}

describe('cacheWordListItems / cacheWordFull (F20)', () => {
  it('list-item не затирает rich-поля и createdAt существующего полного слова', async () => {
    const db = await makeTestDb();
    await db.words.insert(FULL_WORD);

    await cacheWordListItems(db, [listItem(FULL_WORD.id)]);

    const cached = await db.words.findOne(FULL_WORD.id).exec();
    expect(cached?.get('audioUrl')).toBe(FULL_WORD.audioUrl);
    expect(cached?.get('mnemonic')).toBe(FULL_WORD.mnemonic);
    expect(cached?.get('createdAt')).toBe(FULL_WORD.createdAt);
    expect(cached?.get('examples')).toHaveLength(1);
    expect(cached?.get('tags')).toHaveLength(1);
  });

  it('list-item обновляет базовые поля, но оставляет rich-данные нетронутыми', async () => {
    const db = await makeTestDb();
    await db.words.insert(FULL_WORD);

    await cacheWordListItems(db, [
      listItem(FULL_WORD.id, { translation: 'обновлённый перевод', hskLevel: 2 }),
    ]);

    const cached = await db.words.findOne(FULL_WORD.id).exec();
    expect(cached?.get('translation')).toBe('обновлённый перевод');
    expect(cached?.get('hskLevel')).toBe(2);
    expect(cached?.get('mnemonic')).toBe(FULL_WORD.mnemonic);
    expect(cached?.get('examples')).toHaveLength(1);
  });

  it('новый list-item создаёт документ без rich-полей (первый контакт)', async () => {
    const db = await makeTestDb();
    const item = listItem('22222222-2222-4222-8222-222222222222');

    await cacheWordListItems(db, [item]);

    const cached = await db.words.findOne(item.id).exec();
    expect(cached?.get('character')).toBe(item.character);
    expect(cached?.get('audioUrl')).toBeNull();
    expect(cached?.get('mnemonic')).toBeNull();
    expect(cached?.get('examples')).toEqual([]);
  });

  it('cacheWordFull перезаписывает бедный документ полными данными', async () => {
    const db = await makeTestDb();
    await cacheWordListItems(db, [listItem(FULL_WORD.id)]);
    expect((await db.words.findOne(FULL_WORD.id).exec())?.get('mnemonic')).toBeNull();

    await cacheWordFull(db, FULL_WORD);

    const cached = await db.words.findOne(FULL_WORD.id).exec();
    expect(cached?.get('mnemonic')).toBe(FULL_WORD.mnemonic);
    expect(cached?.get('audioUrl')).toBe(FULL_WORD.audioUrl);
    expect(cached?.get('examples')).toHaveLength(1);
    expect(cached?.get('tags')).toHaveLength(1);
  });
});
