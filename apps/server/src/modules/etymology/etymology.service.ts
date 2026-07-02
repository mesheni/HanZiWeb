import { prisma } from '../../lib/prisma.js';
import { lookupEtymology } from '../../lib/etymology/lookup.js';
import type { Etymology } from '@hanzi/shared';

/**
 * Достаёт этимологию иероглифа из встроенного словаря для слова по id.
 *
 * Если слово не найдено — бросает 404. Если иероглиф в словаре
 * отсутствует — возвращает «пустую» запись (`found: false`).
 */
export async function getWordEtymology(wordId: string): Promise<Etymology> {
  const word = await prisma.word.findUnique({
    where: { id: wordId },
    select: { id: true, character: true, pinyin: true },
  });
  if (!word) {
    throw Object.assign(new Error('Word not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }

  return lookupEtymology(word.character, word.pinyin);
}
