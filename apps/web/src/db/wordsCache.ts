import type { RxDatabase } from 'rxdb';
import type { Word, WordListItem } from '@hanzi/shared';
import type { DbCollections } from './database';

/**
 * F20: list-ответы (WordListItem) не содержат audioUrl/mnemonic/examples/
 * tags/createdAt. Прямой upsert перезаписывал полные документы кэша
 * бедными null'ами — офлайн-копия теряла мнемоники, примеры и теги.
 * Здесь merge: поля, которых нет в list-item, берутся из существующего
 * документа; createdAt не трогается (это дата создания слова, а не
 * момента кэширования).
 */
export async function cacheWordListItems(
  db: RxDatabase<DbCollections>,
  items: readonly WordListItem[],
): Promise<void> {
  if (items.length === 0) return;

  const ids = items.map((item) => item.id);
  const existingDocs = await db.words.find({ selector: { id: { $in: ids } } }).exec();
  const existingById = new Map(existingDocs.map((doc) => [doc.get('id'), doc]));
  const now = new Date().toISOString();

  await db.words.bulkUpsert(
    items.map((item) => {
      const existing = existingById.get(item.id);
      return {
        id: item.id,
        character: item.character,
        pinyin: item.pinyin,
        translation: item.translation,
        hskLevel: item.hskLevel,
        // Rich-поля: нет в WordListItem — сохраняем из кэша.
        audioUrl: existing?.get('audioUrl') ?? null,
        mnemonic: existing?.get('mnemonic') ?? null,
        createdAt: existing?.get('createdAt') ?? now,
        examples: existing?.get('examples') ?? [],
        tags: existing?.get('tags') ?? [],
      };
    }),
  );
}

/**
 * F20: полный Word (GET /words/:id) пишется в кэш целиком — это
 * источник rich-полей для офлайн-режима. Свежие данные сервера
 * перезаписывают устаревший бедный документ полностью.
 */
export async function cacheWordFull(db: RxDatabase<DbCollections>, word: Word): Promise<void> {
  await db.words.upsert({
    id: word.id,
    character: word.character,
    pinyin: word.pinyin,
    translation: word.translation,
    hskLevel: word.hskLevel,
    audioUrl: word.audioUrl,
    mnemonic: word.mnemonic,
    createdAt: word.createdAt,
    examples: word.examples,
    tags: word.tags,
  });
}
