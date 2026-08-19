/**
 * Сид примеров предложений из локального датасета hsk-sentences.json
 * (замена Tatoeba-импорту). Предложения привязываются к словам по
 * вхождению слова в текст, аудио-URL детерминированы от id предложения
 * (файлы импортируются скриптом import-sentence-audio.ts).
 *
 * Запуск:
 *   pnpm --filter @hanzi/server run examples:seed
 *   pnpm --filter @hanzi/server run examples:seed -- --perWord=4 --hskLevel=1
 *   pnpm --filter @hanzi/server run examples:seed -- --dryRun
 *
 * Аргументы:
 *   --perWord=K    сколько примеров оставлять на слово (по умолчанию 6)
 *   --hskLevel=N   фильтр слов по уровню HSK (1..6); без — все уровни
 *   --limit=N      обработать максимум N слов (по умолчанию все)
 *   --dryRun       ничего не записывать в БД, только лог
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadDotEnv } from './load-env.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
await loadDotEnv(join(scriptDir, '..', '.env'));

const prisma = new PrismaClient();

interface Sentence {
  id: string;
  zh: string;
  pinyin: string;
  ru: string;
  level: number | null;
}

interface Args {
  perWord: number;
  hskLevel?: number;
  limit?: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { perWord: 6, dryRun: false };
  for (const a of argv) {
    if (a.startsWith('--perWord=')) out.perWord = parseInt(a.slice(10), 10);
    else if (a.startsWith('--hskLevel=')) out.hskLevel = parseInt(a.slice(11), 10);
    else if (a.startsWith('--limit=')) out.limit = parseInt(a.slice(8), 10);
    else if (a === '--dryRun') out.dryRun = true;
  }
  return out;
}

/** Публичный базовый URL аудио — та же логика, что в audio.service. */
function audioPublicBase(): string {
  if (process.env.GCS_BUCKET_NAME) {
    return `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}`;
  }
  return process.env.AUDIO_PUBLIC_BASE_URL ?? 'http://localhost:3001/audio/files';
}

/**
 * Ранг предложения для слова: сначала совпадение уровня, затем уровень
 * ниже уровня слова (доступная лексика), затем всё остальное; внутри
 * тиры — по возрастанию уровня и длины.
 */
function rankSentence(s: Sentence, wordLevel: number | null): number[] {
  const lvl = s.level ?? 9;
  const tier =
    wordLevel != null && lvl === wordLevel ? 0 : wordLevel != null && lvl < wordLevel ? 1 : 2;
  return [tier, lvl, s.zh.length];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const datasetPath = join(scriptDir, '..', 'prisma', 'seeds', 'hsk-sentences.json');
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8')) as { sentences: Sentence[] };
  const sentences = dataset.sentences;

  console.log('Seeding examples from hsk-sentences dataset…');
  console.log(
    `  sentences=${sentences.length}  perWord=${args.perWord}  hskLevel=${args.hskLevel ?? 'all'}  dryRun=${args.dryRun}`,
  );

  const words = await prisma.word.findMany({
    where: { hskLevel: args.hskLevel ?? { not: null } },
    select: { id: true, character: true, hskLevel: true },
    orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
    ...(args.limit ? { take: args.limit } : {}),
  });
  console.log(`Found ${words.length} words.`);

  if (!args.dryRun) {
    const wiped = await prisma.example.deleteMany({
      where: { source: { in: ['tatoeba', 'hsk_audio'] } },
    });
    console.log(`Removed ${wiped.count} old examples (tatoeba/hsk_audio).`);
  }

  const base = audioPublicBase();
  const rows: Array<{
    wordId: string;
    chinese: string;
    pinyin: string;
    russian: string;
    source: string;
    hskLevel: number | null;
    audioUrl: string;
    audioSlowUrl: string;
  }> = [];

  for (const w of words) {
    const picked = sentences
      .filter((s) => s.zh.includes(w.character))
      .sort((a, b) => {
        const ra = rankSentence(a, w.hskLevel);
        const rb = rankSentence(b, w.hskLevel);
        return ra[0]! - rb[0]! || ra[1]! - rb[1]! || ra[2]! - rb[2]!;
      })
      .slice(0, args.perWord);

    for (const s of picked) {
      rows.push({
        wordId: w.id,
        chinese: s.zh,
        pinyin: s.pinyin,
        russian: s.ru,
        source: 'hsk_audio',
        hskLevel: s.level,
        audioUrl: `${base}/${s.id}.mp3`,
        audioSlowUrl: `${base}/${s.id}_slow.mp3`,
      });
    }
  }

  const wordsWithExamples = new Set(rows.map((r) => r.wordId)).size;
  console.log(
    `Prepared ${rows.length} examples for ${wordsWithExamples}/${words.length} words${args.dryRun ? ' (dry run)' : ''}.`,
  );

  if (!args.dryRun) {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prisma.example.createMany({ data: rows.slice(i, i + CHUNK) });
    }
    console.log('Inserted.');
  }

  const empty = words.length - wordsWithExamples;
  if (empty > 0) console.log(`  Words without matching sentences: ${empty}`);
}

main()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('seed-sentences failed:', err);
    prisma.$disconnect();
    process.exit(1);
  });
