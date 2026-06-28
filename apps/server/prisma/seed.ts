import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

interface HskWord {
  id: number;
  word: string; // может содержать | для вариантов: "爸爸|爸"
  pinyin: string; // может содержать | или ; для вариантов
  translation: string;
}

/** Берёт первый вариант слова до символа |. "爸爸|爸" → "爸爸" */
function normalizeCharacter(raw: string): string {
  const idx = raw.indexOf('|');
  return idx === -1 ? raw : raw.slice(0, idx);
}

/** Берёт первый вариант пиньиня до ; или |. "ā; á" → "ā" */
function normalizePinyin(raw: string): string {
  const semi = raw.indexOf(';');
  const pipe = raw.indexOf('|');
  const idx = semi === -1 ? pipe : pipe === -1 ? semi : Math.min(semi, pipe);
  return idx === -1 ? raw.trim() : raw.slice(0, idx).trim();
}

function loadWords(filePath: string): HskWord[] {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as HskWord[];
}

async function seedLevel(level: number, fileName: string): Promise<void> {
  const filePath = join(__dirname, 'seeds', fileName);
  if (!existsSync(filePath)) {
    console.log(`HSK ${level}: file ${fileName} not found — skipping`);
    return;
  }

  const words = loadWords(filePath);
  console.log(`Seeding HSK ${level}: ${words.length} words from ${fileName}`);

  let created = 0;
  let skipped = 0;

  for (const entry of words) {
    const character = normalizeCharacter(entry.word);
    const pinyin = normalizePinyin(entry.pinyin);

    const existing = await prisma.word.findFirst({
      where: { character, hskLevel: level },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.word.create({
      data: {
        character,
        pinyin,
        translation: entry.translation,
        hskLevel: level,
      },
    });
    created++;
  }

  console.log(`  Created: ${created}, Skipped: ${skipped}`);
}

async function main(): Promise<void> {
  console.log('Starting HSK seed...\n');

  const levels = [
    { level: 1, file: 'hsk1.json' },
    { level: 2, file: 'hsk2.json' },
    { level: 3, file: 'hsk3.json' },
    { level: 4, file: 'hsk4.json' },
    { level: 5, file: 'hsk5.json' },
    { level: 6, file: 'hsk6.json' },
  ];

  for (const { level, file } of levels) {
    await seedLevel(level, file);
  }

  const total = await prisma.word.count();
  console.log(`\nSeed complete. Total words in database: ${total}`);
}

main()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    prisma.$disconnect();
    process.exit(1);
  });
