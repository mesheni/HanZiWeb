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

/** Creates or finds a system deck for an HSK level. Returns the deck ID. */
async function ensureSystemDeck(level: number): Promise<string> {
  const wordCount = await prisma.word.count({ where: { hskLevel: level } });
  const name = `HSK ${level}`;
  const description = `Базовая лексика HSK ${level} (${wordCount} слов)`;

  const existing = await prisma.deck.findFirst({ where: { name } });
  if (existing) {
    console.log(`  Deck "${name}" already exists (${wordCount} words)`);
    return existing.id;
  }

  const deck = await prisma.deck.create({
    data: { name, description, isSystemDeck: true },
  });
  console.log(`  Created deck "${name}" — ${description}`);
  return deck.id;
}

/** Links all words of a given HSK level to a deck. Returns number of new links. */
async function linkWordsToDeck(deckId: string, hskLevel: number): Promise<number> {
  const words = await prisma.word.findMany({
    where: { hskLevel },
    select: { id: true },
  });

  if (words.length === 0) return 0;

  // Find already-linked words to avoid unique-constraint violations
  const existing = await prisma.deckWord.findMany({
    where: { deckId, wordId: { in: words.map((w) => w.id) } },
    select: { wordId: true },
  });
  const existingIds = new Set(existing.map((e) => e.wordId));

  const newEntries = words
    .filter((w) => !existingIds.has(w.id))
    .map((w) => ({ deckId, wordId: w.id }));

  if (newEntries.length === 0) {
    console.log(`  All ${words.length} words already linked to deck`);
    return 0;
  }

  await prisma.deckWord.createMany({ data: newEntries });
  console.log(`  Linked ${newEntries.length} words to deck (${existingIds.size} already linked)`);
  return newEntries.length;
}

/**
 * Тематические колоды (F28a, PLAN_Features_v0.2 §5): «Еда»,
 * «Путешествия», «Работа» — несистемные колоды из слов, уже
 * засиженных HSK-сидом (по иероглифам). Идемпотентно.
 */
interface ThematicDeck {
  name: string;
  description: string;
  characters: string[];
}

const THEMATIC_DECKS: ThematicDeck[] = [
  {
    name: 'Еда',
    description: 'Продукты, напитки и приём пищи',
    characters: [
      '吃', '喝', '水', '茶', '饭', '菜', '苹果', '牛奶', '咖啡', '米饭',
      '面包', '鸡蛋', '肉', '鱼', '水果', '饿', '好吃', '餐厅', '菜单',
      '面条', '啤酒', '果汁', '西瓜', '味道', '糖', '饮料', '点心', '盐',
    ],
  },
  {
    name: 'Путешествия',
    description: 'Транспорт, поездки и отдых',
    characters: [
      '旅行', '飞机', '火车', '车', '票', '酒店', '地图', '机场', '车站',
      '旅游', '自行车', '船', '行李', '护照', '宾馆', '路线', '出发',
      '到达', '司机', '地铁', '航班', '游客', '天气', '旅馆',
    ],
  },
  {
    name: 'Работа',
    description: 'Офис, профессии и деловые встречи',
    characters: [
      '工作', '公司', '老板', '同事', '会议', '办公室', '电脑', '邮件',
      '电话', '项目', '经理', '员工', '简历', '工资', '行业', '职业',
      '任务', '报告', '客户', '面试', '上班', '加班', '打工', '生意',
    ],
  },
];

/** Создаёт/находит тематическую колоду и линкует найденные слова. */
async function ensureThematicDeck(deck: ThematicDeck): Promise<number> {
  const words = await prisma.word.findMany({
    where: { character: { in: deck.characters } },
    select: { id: true, character: true },
  });
  const found = new Set(words.map((w) => w.character));
  const missing = deck.characters.filter((c) => !found.has(c));
  if (missing.length > 0) {
    console.log(
      `  "${deck.name}": ${missing.length} not in dictionary — ${missing.join(', ')}`,
    );
  }

  const existing = await prisma.deck.findFirst({ where: { name: deck.name } });
  let deckId: string;
  if (existing) {
    deckId = existing.id;
    console.log(`  Deck "${deck.name}" already exists (${words.length} words)`);
  } else {
    const created = await prisma.deck.create({
      data: { name: deck.name, description: deck.description, isSystemDeck: false },
    });
    deckId = created.id;
    console.log(`  Created deck "${deck.name}" — ${deck.description}`);
  }

  const existingLinks = await prisma.deckWord.findMany({
    where: { deckId, wordId: { in: words.map((w) => w.id) } },
    select: { wordId: true },
  });
  const existingIds = new Set(existingLinks.map((e) => e.wordId));
  const newEntries = words
    .filter((w) => !existingIds.has(w.id))
    .map((w) => ({ deckId, wordId: w.id }));

  if (newEntries.length > 0) {
    await prisma.deckWord.createMany({ data: newEntries });
  }
  console.log(
    `  Linked ${newEntries.length} new words to "${deck.name}" (${existingIds.size} already linked)`,
  );
  return newEntries.length;
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

  let totalDecks = 0;
  let totalLinks = 0;

  for (const { level, file } of levels) {
    await seedLevel(level, file);
    const deckId = await ensureSystemDeck(level);
    const linked = await linkWordsToDeck(deckId, level);
    totalDecks++;
    totalLinks += linked;
    console.log('');
  }

  console.log('Seeding thematic decks (F28a)...');
  let thematicDecks = 0;
  let thematicLinks = 0;
  for (const deck of THEMATIC_DECKS) {
    thematicLinks += await ensureThematicDeck(deck);
    thematicDecks++;
    console.log('');
  }

  const totalWords = await prisma.word.count();
  const totalDeckWords = await prisma.deckWord.count();
  console.log(`Seed complete.`);
  console.log(`  Total words:      ${totalWords}`);
  console.log(`  System decks:     ${totalDecks}`);
  console.log(`  Thematic decks:   ${thematicDecks} (+${thematicLinks} links)`);
  console.log(`  Deck-word links:  ${totalLinks} (total: ${totalDeckWords})`);
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
