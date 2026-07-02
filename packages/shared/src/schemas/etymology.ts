import { z } from 'zod';

/**
 * Структурный тип иероглифа (идеографическое описание — IDS).
 *
 *  - `simple`     — неразложимый иероглиф (single radical, нет очевидных частей).
 *  - `left-right` — 半包围 / 左右结构 (напр. 好 = 女 + 子).
 *  - `top-bottom` — 上下结构 (напр. 安 = 宀 + 女).
 *  - `surrounding` — 全包围 / 外包结构 (напр. 国 = 囗 + 玉).
 *  - `overlap`    — сложная композиция, которую нельзя свести к
 *                   одной из простых структур.
 */
export const CharacterStructureSchema = z.enum([
  'simple',
  'left-right',
  'top-bottom',
  'surrounding',
  'overlap',
]);
export type CharacterStructure = z.infer<typeof CharacterStructureSchema>;

/** Радикал (ключ) иероглифа по Канси (214 ключей). */
export const EtymologyRadicalSchema = z.object({
  /** Сам радикал как иероглиф. */
  character: z.string().min(1).max(4),
  /** Номер радикала по Канси (1–214). */
  number: z.number().int().min(1).max(214).nullable().default(null),
  /** Название радикала по-русски. */
  name: z.string().min(1),
  /** Краткое значение. */
  meaning: z.string().min(1),
});
export type EtymologyRadical = z.infer<typeof EtymologyRadicalSchema>;

/** Составляющая иероглифа (компонент). */
export const EtymologyComponentSchema = z.object({
  /** Сам компонент (иероглиф). */
  character: z.string().min(1).max(4),
  /** Пиньинь компонента (может быть null для фонетиков без устоявшегося чтения). */
  pinyin: z.string().nullable().default(null),
  /** Краткое значение на русском. */
  meaning: z.string().min(1),
  /** Роль компонента: `semantic` (символическая/идеографическая),
   *  `phonetic` (фонетик, задаёт чтение), `both` (комбинация). */
  role: z.enum(['semantic', 'phonetic', 'both']).default('semantic'),
});
export type EtymologyComponent = z.infer<typeof EtymologyComponentSchema>;

/** Полная развёртка этимологии одного иероглифа. */
export const EtymologySchema = z.object({
  /** Иероглиф, к которому относится карточка. */
  character: z.string().min(1).max(8),
  /** Пиньинь (извлечён из `Word.pinyin` для контекста). */
  pinyin: z.string().min(1).nullable().default(null),
  /** Количество черт (опционально, рассчитывается по словарю). */
  strokeCount: z.number().int().min(1).max(50).nullable().default(null),
  /** Радикал. */
  radical: EtymologyRadicalSchema.nullable().default(null),
  /** Структурный тип. */
  structure: CharacterStructureSchema,
  /** Компоненты, из которых состоит иероглиф (радикал может совпадать). */
  components: z.array(EtymologyComponentSchema).default([]),
  /** Краткое описание происхождения / значения. */
  etymology: z.string().nullable().default(null),
  /** Краткая мнемоника (как запомнить). */
  mnemonic: z.string().nullable().default(null),
  /** `true`, если данные взяты из встроенного словаря;
   *  `false`, если иероглифа в словаре нет (тогда большинство полей пустые). */
  found: z.boolean(),
});
export type Etymology = z.infer<typeof EtymologySchema>;
