import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type { ApiClient } from '@hanzi/mobile-sdk';
import type { PaginatedResponse, WordListItem } from '@hanzi/shared';
import { WordModel } from './models';

/**
 * F21: наполняет таблицу `words` словарём с сервера (пагинированный
 * GET /words). До фикса таблица была объявлена в схеме, но никогда не
 * заполнялась — офлайн-карточки не из чего было собирать.
 *
 * WordListItem — «плоский» DTO (id/character/pinyin/translation/
 * hskLevel); rich-поля (mnemonic/examples/tags/audioUrl) для
 * flip-card-сессии не нужны, в таблице они остаются пустыми.
 */
export async function syncWordLibrary(db: Database, api: ApiClient): Promise<void> {
  const limit = 100;
  let offset = 0;

  for (;;) {
    const result = await api.get<PaginatedResponse<WordListItem>>(
      `/words?limit=${limit}&offset=${offset}`,
    );
    if (!result.ok) throw new Error(result.message);

    await upsertWords(db, result.data.data);
    offset += limit;
    if (offset >= result.data.pagination.total) break;
  }
}

async function upsertWords(db: Database, items: readonly WordListItem[]): Promise<void> {
  if (items.length === 0) return;

  const collection = db.get<WordModel>('words');
  const ids = items.map((item) => item.id);
  const existingRows = await collection.query(Q.where('id', Q.oneOf(ids))).fetch();
  const existingById = new Map(existingRows.map((row) => [row.id, row]));

  await db.write(async () => {
    for (const item of items) {
      const row = existingById.get(item.id);
      const patch = (r: WordModel) => {
        r.character = item.character;
        r.pinyin = item.pinyin;
        r.translation = item.translation;
        r.hskLevel = item.hskLevel;
      };
      if (row) {
        await row.update(patch);
      } else {
        await collection.create((r) => {
          // Серверный uuid слова становится id строки — офлайн-сессия
          // матчит progress.wordId по этому id.
          r._raw.id = item.id;
          patch(r);
          r.createdAt = new Date();
        });
      }
    }
  });
}
