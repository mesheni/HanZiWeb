import { z } from 'zod';

/**
 * Тип происхождения иероглифа (упрощённая классификация 六书).
 *
 *  - `pictographic`   — 象形, пиктограмма (например 日 «солнце»).
 *  - `ideographic`    — 会意/指事, идеограмма (например 好 = 女 + 子).
 *  - `pictophonetic`  — 形声, фонетико-семантический: один компонент
 *                       задаёт смысл, другой — чтение (например 吗 = 口 + 马).
 */
export const EtymologyTypeSchema = z.enum([
  'pictographic',
  'ideographic',
  'pictophonetic',
]);
export type EtymologyType = z.infer<typeof EtymologyTypeSchema>;

/**
 * Структурный тип иероглифа — выводится из оператора IDS-декомпозиции.
 *
 *  - `simple`      — без декомпозиции (оператора нет / декомпозиция неизвестна).
 *  - `left-right`  — ⿰ / ⿲ (напр. 好 = 女 + 子).
 *  - `top-bottom`  — ⿱ / ⿳ (напр. 学 = ⺍ + 冖 + 子).
 *  - `surrounding` — ⿴…⿺, охватывающие структуры (напр. 国 = 囗 + 玉).
 *  - `overlap`     — ⿻ и прочие сложные композиции.
 */
export const CharacterStructureSchema = z.enum([
  'simple',
  'left-right',
  'top-bottom',
  'surrounding',
  'overlap',
]);
export type CharacterStructure = z.infer<typeof CharacterStructureSchema>;

/**
 * Компонент иероглифа — лист дерева IDS-декомпозиции.
 */
export const EtymologyComponentSchema = z.object({
  /** Сам компонент (иероглиф или графический примитив). */
  character: z.string().min(1).max(4),
  /** Путь в IDS-дереве: индексы дочерних узлов от корня (напр. `[1, 0]`). */
  path: z.array(z.number().int().min(0)).default([]),
  /** Роль компонента: смысловая / фонетическая / обе — из полей
   *  `phonetic`/`semantic` датасета; `null` — роль не размечена. */
  role: z.enum(['semantic', 'phonetic', 'both']).nullable().default(null),
  /** Русское значение компонента (`definition_ru` из того же датасета). */
  meaningRu: z.string().nullable().default(null),
  /** Пиньинь компонента, если известен. */
  pinyin: z.string().nullable().default(null),
  /** Индексы черт иероглифа, из которых состоит компонент. */
  strokes: z.array(z.number().int().min(0)).default([]),
});
export type EtymologyComponent = z.infer<typeof EtymologyComponentSchema>;

/**
 * Полная развёртка этимологии одного иероглифа
 * (ответ `GET /words/:id/etymology`).
 */
export const EtymologySchema = z.object({
  /** Иероглиф, к которому относится карточка. */
  character: z.string().min(1).max(8),
  /** Пиньинь слова из `Word.pinyin` (контекст карточки). */
  pinyin: z.string().min(1).nullable().default(null),
  /** `true`, если иероглиф есть в датасете; иначе все поля пустые. */
  found: z.boolean(),
  /** Значение одиночного иероглифа (рус. / англ.). */
  definitionRu: z.string().nullable().default(null),
  definitionEn: z.string().nullable().default(null),
  /** IDS-декомпозиция («⿰女子»); `null`, если неизвестна. */
  decomposition: z.string().nullable().default(null),
  /** Структурный тип, выведенный из IDS-оператора. */
  structure: CharacterStructureSchema,
  /** Количество черт (= длина `matches`). */
  strokeCount: z.number().int().min(1).max(64).nullable().default(null),
  /** Радикал (ключ) как символ. */
  radicalChar: z.string().min(1).max(4).nullable().default(null),
  /** Русское значение радикала (если есть в датасете). */
  radicalMeaningRu: z.string().nullable().default(null),
  etymologyType: EtymologyTypeSchema.nullable().default(null),
  /** Человекочитаемый тип по-русски: «пиктографический (象形)» и т.п. */
  etymologyTypeRu: z.string().nullable().default(null),
  /** Этимологическая справка (англ. оригинал датасета). */
  hint: z.string().nullable().default(null),
  /** Этимологическая справка по-русски. */
  hintRu: z.string().nullable().default(null),
  /** Символ фонетического компонента (для 形声). */
  phonetic: z.string().min(1).max(4).nullable().default(null),
  /** Символ смыслового компонента (для 形声). */
  semantic: z.string().min(1).max(4).nullable().default(null),
  /** Уникальные компоненты декомпозиции. */
  components: z.array(EtymologyComponentSchema).default([]),
  /** Мэппинг «черта → путь в IDS-дереве»; элемент `null` — черта
   *  не отнесена ни к одному компоненту. `null` всего поля — данных нет. */
  matches: z.array(z.array(z.number().int().min(0)).nullable()).nullable().default(null),
});
export type Etymology = z.infer<typeof EtymologySchema>;
