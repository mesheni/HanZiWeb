import { parsePinyin } from './packages/shared/src/utils/pinyin.ts';

const cases = [
  'xǐ huān',
  'báitiān',
  'bìyèshēng',
  'ài//guó',
  'ài/guó',
  'nǐhǎo',
  'zhōngguó',
  'xīguǎn',
  'quán',
  'shēng',
  'ma',
  'yī',
  'nǚ',
  'bái',
  'kàn',
  'jiějué',
  'shūbāo',
  'yīxià',
];

for (const c of cases) {
  const r = parsePinyin(c);
  console.log(`${c.padEnd(12)} → ${JSON.stringify(r.map(s => s.syllable))} tones=${JSON.stringify(r.map(s => s.tone))}`);
}