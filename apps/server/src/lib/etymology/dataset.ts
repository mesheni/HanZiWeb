import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Сырая запись датасета этимологий (prisma/seeds/etymology-ru.json).
 *
 * База — Make Me a Hanzi (https://github.com/skishore/makemeahanzi),
 * лицензия Arphic Public License: декомпозиция (IDS), мэппинг черт
 * (`matches`), классификация и английские справки. Русские поля
 * (`definition_ru`, `hint_ru`, `type_ru`) добавлены поверх базы.
 */
export interface RawEtymologyEntry {
  character: string;
  definition: string | null;
  pinyin: string[];
  decomposition: string | null;
  radical: string | null;
  matches: (number[] | null)[] | null;
  definition_ru: string | null;
  etymology: {
    type: 'pictographic' | 'ideographic' | 'pictophonetic' | null;
    hint: string | null;
    phonetic?: string | null;
    semantic?: string | null;
    hint_ru: string | null;
    type_ru: string | null;
  } | null;
}

let cache: Map<string, RawEtymologyEntry> | null = null;

/**
 * Датасет этимологий как `Map` по иероглифу (~9,5 тыс. записей).
 *
 * Грузится лениво, один раз за процесс: `JSON.parse` файла ~4 МБ
 * занимает десятки миллисекунд, поэтому выносим разогрев из старта.
 */
export function getEtymologyDataset(): Map<string, RawEtymologyEntry> {
  if (cache === null) {
    const path = resolve(process.cwd(), 'prisma/seeds/etymology-ru.json');
    const entries = JSON.parse(readFileSync(path, 'utf8')) as RawEtymologyEntry[];
    cache = new Map(entries.map((entry) => [entry.character, entry]));
  }
  return cache;
}

export function hasEtymologyEntry(character: string): boolean {
  return getEtymologyDataset().has(character);
}
