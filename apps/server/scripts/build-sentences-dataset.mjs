/**
 * Разовая сборка компактного датасета предложений из полного индекса
 * hsk30-sentences-index-ru.json (57MB: glosses_ru, en, en_ru).
 *
 * Оставляем только поля, нужные приложению: id, zh, pinyin, ru, level.
 * Результат: prisma/seeds/hsk-sentences.json (~1MB), коммитится в репо.
 *
 * Запуск:
 *   node scripts/build-sentences-dataset.mjs C:/path/to/hsk30-sentences-index-ru.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv[2];
const outputPath = join(scriptDir, '..', 'prisma', 'seeds', 'hsk-sentences.json');

if (!inputPath) {
  console.error('Укажите путь к исходному hsk30-sentences-index-ru.json');
  process.exit(1);
}

const raw = JSON.parse(await readFile(inputPath, 'utf8'));

const byId = new Map();
for (const entry of Object.values(raw.characters)) {
  for (const s of entry.sentences ?? []) {
    if (!s.id || !s.zh) continue;
    if (byId.has(s.id)) continue;
    const ru = s.ru || s.en_ru || s.en || null;
    if (!ru) continue;
    byId.set(s.id, { id: s.id, zh: s.zh, pinyin: s.pinyin ?? '', ru, level: s.level ?? null });
  }
}

const sentences = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
const dataset = {
  meta: {
    source: raw.meta?.source ?? 'hsk-sentences-audio',
    generated: new Date().toISOString().slice(0, 10),
    sentence_count: sentences.length,
  },
  sentences,
};

await writeFile(outputPath, JSON.stringify(dataset), 'utf8');

console.log(`OK: ${sentences.length} предложений -> ${outputPath}`);
const bytes = (await readFile(outputPath)).length;
console.log(`Размер: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
