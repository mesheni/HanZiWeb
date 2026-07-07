/**
 * Сид интерактивных текстов для вкладки «Чтение».
 *
 * Запуск:
 *   pnpm --filter @hanzi/server reading:seed
 *   pnpm --filter @hanzi/server reading:seed --hskLevel=1 --dryRun
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { buildTrie, tokenize } from '../src/modules/reading/tokenizer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

interface ReadingInput {
  title: string;
  hskLevel: number;
  author?: string | null;
  source?: string | null;
  paragraphs: string[];
}

interface Args {
  hskLevel?: number;
  dryRun: boolean;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false };
  for (const arg of argv) {
    if (arg.startsWith('--hskLevel=')) {
      out.hskLevel = parseInt(arg.slice(11), 10);
    } else if (arg === '--dryRun') {
      out.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      out.limit = parseInt(arg.slice(8), 10);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const seedsDir = join(__dirname, '..', 'prisma', 'seeds', 'reading');

  const words = await prisma.word.findMany({
    select: { id: true, character: true, hskLevel: true },
    orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
  });
  const trie = buildTrie(words);
  const charToWordId = new Map(words.map((w) => [w.character, w.id]));

  const files = readdirSync(seedsDir)
    .filter((f) => /^hsk\d+\.json$/.test(f))
    .sort();

  let totalTexts = 0;
  let totalTokens = 0;

  for (const file of files) {
    const level = parseInt(file.replace(/^hsk(\d+)\.json$/, '$1'), 10);
    if (Number.isNaN(level)) continue;
    if (args.hskLevel !== undefined && args.hskLevel !== level) continue;

    const raw = readFileSync(join(seedsDir, file), 'utf-8');
    const texts = JSON.parse(raw) as ReadingInput[];
    const toProcess = args.limit !== undefined ? texts.slice(0, args.limit) : texts;

    let created = 0;

    for (const text of toProcess) {
      const existing = await prisma.readingText.findFirst({
        where: { title: text.title, hskLevel: level },
        select: { id: true },
      });
      if (existing) {
        console.log(`  Skipping "${text.title}" — already exists`);
        continue;
      }

      const content = text.paragraphs.join('\n\n');
      const rawTokens = tokenize(content, trie);
      const matchedTokens = rawTokens
        .map((t) => ({ ...t, wordId: charToWordId.get(t.surface) }))
        .filter((t): t is typeof t & { wordId: string } => t.wordId !== undefined);

      if (args.dryRun) {
        console.log(
          `  [dry-run] HSK ${level} "${text.title}" — ${matchedTokens.length} matched tokens`,
        );
        created++;
        totalTokens += matchedTokens.length;
        continue;
      }

      const readingText = await prisma.readingText.create({
        data: {
          title: text.title,
          content,
          hskLevel: level,
          author: text.author ?? null,
          source: text.source ?? 'HanZiWeb',
          wordCount: matchedTokens.length,
        },
      });

      if (matchedTokens.length > 0) {
        await prisma.readingTextWord.createMany({
          data: matchedTokens.map((t) => ({
            textId: readingText.id,
            wordId: t.wordId,
            position: t.position,
            length: t.length,
          })),
        });
      }

      console.log(
        `  Created "${text.title}" (HSK ${level}, ${matchedTokens.length} tokens)`,
      );
      created++;
      totalTokens += matchedTokens.length;
    }

    console.log(`HSK ${level}: ${created} texts`);
    totalTexts += created;
  }

  console.log(`\nDone. ${totalTexts} texts, ${totalTokens} matched tokens.`);
}

main()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('Seed reading texts failed:', err);
    prisma.$disconnect();
    process.exit(1);
  });
