/**
 * Импорт mp3-файлов предложений (обычное + медленное произношение)
 * в аудио-хранилище: локальная папка (dev, раздача через
 * GET /audio/files/:fileName) или GCS-бакет (prod, GCS_BUCKET_NAME).
 *
 * Источник: <repoRoot>/hsk_audio/hsk-audio-hsk{1..6}/*.mp3 (не в git).
 * Идемпотентно: существующие в хранилище файлы пропускаются.
 *
 * Запуск:
 *   pnpm --filter @hanzi/server run audio:import-sentences
 *   pnpm --filter @hanzi/server run audio:import-sentences -- --dry --limit=100
 *
 * Аргументы:
 *   --source=DIR   исходная папка (по умолчанию <repoRoot>/hsk_audio)
 *   --limit=N      максимум файлов
 *   --concurrency=N  параллельных загрузок в GCS (по умолчанию 8)
 *   --dry          ничего не записывать, только лог
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadDotEnv } from './load-env.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
await loadDotEnv(join(scriptDir, '..', '.env'));

interface Args {
  source: string;
  limit?: number;
  concurrency: number;
  dry: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    source: resolve(scriptDir, '..', '..', '..', 'hsk_audio'),
    concurrency: 8,
    dry: false,
  };
  for (const a of argv) {
    if (a.startsWith('--source=')) out.source = resolve(a.slice(9));
    else if (a.startsWith('--limit=')) out.limit = parseInt(a.slice(8), 10);
    else if (a.startsWith('--concurrency=')) out.concurrency = parseInt(a.slice(14), 10);
    else if (a === '--dry') out.dry = true;
  }
  return out;
}

async function collectFiles(source: string): Promise<string[]> {
  const subdirs = (await readdir(source, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => join(source, d.name))
    .sort();
  const files: string[] = [];
  for (const dir of subdirs) {
    const names = (await readdir(dir)).filter((n) => n.endsWith('.mp3')).sort();
    for (const n of names) files.push(join(dir, n));
  }
  return files;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const files = await collectFiles(args.source);
  const selected = args.limit ? files.slice(0, args.limit) : files;
  console.log(`Importing sentence audio from ${args.source}`);
  console.log(
    `  files=${selected.length}/${files.length}  concurrency=${args.concurrency}  dry=${args.dry}`,
  );

  // Динамический импорт ПОСЛЕ loadDotEnv: audio.service читает конфиг
  // на уровне модуля и выходит из процесса при невалидном окружении.
  const { resolveStorage } = await import('../src/modules/audio/audio.service.js');
  const storage = resolveStorage();

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < selected.length; i += args.concurrency) {
    const batch = selected.slice(i, i + args.concurrency);
    const results = await Promise.all(
      batch.map(async (path) => {
        const name = path.split(/[\\/]/).pop()!;
        try {
          if (await storage.exists(name)) {
            skipped++;
            return;
          }
          if (!args.dry) {
            await storage.save(name, await readFile(path));
          }
          copied++;
        } catch (err) {
          failed++;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`  ! ${name} failed: ${msg}`);
        }
      }),
    );
    void results;
    if ((i / args.concurrency) % 20 === 0) {
      console.log(`  progress: ${Math.min(i + args.concurrency, selected.length)}/${selected.length}`);
    }
  }

  console.log('\nDone.');
  console.log(`  Copied:  ${copied}${args.dry ? ' (dry run)' : ''}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed:  ${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('import-sentence-audio failed:', err);
    process.exit(1);
  });
