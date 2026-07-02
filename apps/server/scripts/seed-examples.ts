/**
 * Сид примеров предложений из Tatoeba для HSK-словаря.
 *
 * Запуск:
 *   pnpm --filter @hanzi/server exec tsx scripts/seed-examples.ts
 *   pnpm --filter @hanzi/server exec tsx scripts/seed-examples.ts --limit=100 --perWord=2
 *   pnpm --filter @hanzi/server exec tsx scripts/seed-examples.ts --dryRun
 *
 * Аргументы:
 *   --limit=N      обработать максимум N слов (по умолчанию все)
 *   --perWord=K    сколько примеров брать на слово (по умолчанию 2)
 *   --hskLevel=N   фильтр по уровню HSK (1..6); без — все уровни
 *   --dryRun       ничего не записывать в БД, только лог
 *   --delayMs=N    пауза между запросами к Tatoeba (по умолчанию 200мс)
 */
import { PrismaClient } from '@prisma/client';
import { getSentencesWithTranslations, pickRussianTranslation } from '../src/lib/tatoeba.js';

const prisma = new PrismaClient();

interface Args {
  limit?: number;
  perWord: number;
  hskLevel?: number;
  dryRun: boolean;
  delayMs: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { perWord: 2, dryRun: false, delayMs: 200 };
  for (const a of argv) {
    if (a.startsWith('--limit=')) out.limit = parseInt(a.slice(8), 10);
    else if (a.startsWith('--perWord=')) out.perWord = parseInt(a.slice(10), 10);
    else if (a.startsWith('--hskLevel=')) out.hskLevel = parseInt(a.slice(11), 10);
    else if (a === '--dryRun') out.dryRun = true;
    else if (a.startsWith('--delayMs=')) out.delayMs = parseInt(a.slice(10), 10);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log('Seeding examples from Tatoeba…');
  console.log(
    `  limit=${args.limit ?? '∞'}  perWord=${args.perWord}  hskLevel=${args.hskLevel ?? 'all'}  dryRun=${args.dryRun}  delayMs=${args.delayMs}`,
  );

  const words = await prisma.word.findMany({
    where: {
      hskLevel: args.hskLevel ?? { not: null },
      ...(args.limit ? { id: { not: undefined } } : {}),
    },
    select: { id: true, character: true, hskLevel: true, _count: { select: { examples: true } } },
    orderBy: [{ hskLevel: 'asc' }, { createdAt: 'asc' }],
    ...(args.limit ? { take: args.limit } : {}),
  });

  console.log(`Found ${words.length} words. Already have examples: ${words.filter((w) => w._count.examples > 0).length}`);

  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const w of words) {
    // Пропускаем слова, у которых уже достаточно примеров.
    if (w._count.examples >= args.perWord) {
      skipped++;
      continue;
    }

    const need = args.perWord - w._count.examples;
    try {
      const sentences = await getSentencesWithTranslations({
        word: w.character,
        lang: 'cmn',
        transLang: 'rus',
        limit: need * 2, // берём с запасом — переводы есть не у всех
      });
      fetched += sentences.length;

      let localAdded = 0;
      for (const s of sentences) {
        if (localAdded >= need) break;
        const ru = pickRussianTranslation(s, 'rus');
        if (!ru) continue;

        // Дедуп по tatoebaId — уникальный индекс Example.tatoebaId
        const exists = await prisma.example.findFirst({ where: { tatoebaId: BigInt(s.id) } });
        if (exists) continue;

        if (!args.dryRun) {
          await prisma.example.create({
            data: {
              wordId: w.id,
              chinese: s.text,
              russian: ru.text,
              source: 'tatoeba',
              tatoebaId: BigInt(s.id),
            },
          });
        }
        inserted++;
        localAdded++;
      }

      if (localAdded > 0) {
        console.log(`  +${localAdded} examples for "${w.character}" (HSK ${w.hskLevel ?? '?'})`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ! "${w.character}" failed: ${msg}`);
    }

    if (args.delayMs > 0) {
      await sleep(args.delayMs);
    }
  }

  console.log('\nDone.');
  console.log(`  Words scanned:  ${words.length}`);
  console.log(`  Skipped (full): ${skipped}`);
  console.log(`  Sentences seen: ${fetched}`);
  console.log(`  Inserted:       ${inserted}${args.dryRun ? ' (dry run)' : ''}`);
  console.log(`  Failed words:   ${failed}`);
}

main()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('seed-examples failed:', err);
    prisma.$disconnect();
    process.exit(1);
  });
