import { readFile } from 'node:fs/promises';

/** Мини-загрузчик .env для tsx-скриптов (Prisma CLI читает .env сам, tsx — нет). */
export async function loadDotEnv(path: string): Promise<void> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]!] !== undefined) continue;
    // Пустое значение (VAR= или VAR="") — считаем «не задано»: zod-схема
    // конфига коэрцирует пустую строкку в 0 и падает на .positive().
    const value = m[2]!.replace(/^["']|["']$/g, '');
    if (value === '') continue;
    process.env[m[1]!] = value;
  }
}
