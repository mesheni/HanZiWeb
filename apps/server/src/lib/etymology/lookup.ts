import type { CharacterStructure, Etymology, EtymologyComponent } from '@hanzi/shared';
import { getEtymologyDataset, type RawEtymologyEntry } from './dataset.js';

const BINARY_OPS = new Set(['⿰', '⿱', '⿴', '⿵', '⿶', '⿷', '⿸', '⿹', '⿺', '⿻', '⿼', '⿽']);
const TERNARY_OPS = new Set(['⿲', '⿳']);
const SURROUNDING_OPS = new Set(['⿴', '⿵', '⿶', '⿷', '⿸', '⿹', '⿺']);
const UNKNOWN_LEAF = '？';

/** Узел дерева IDS-декомпозиции: оператор или лист-символ. */
interface IdsNode {
  op: string | null;
  leaf: string | null;
  path: number[];
  children: IdsNode[];
}

function parseIds(ids: string): IdsNode | null {
  let pos = 0;

  const parseNode = (path: number[]): IdsNode | null => {
    const ch = ids[pos];
    if (ch === undefined) return null;
    pos += 1;
    if (TERNARY_OPS.has(ch) || BINARY_OPS.has(ch)) {
      const arity = TERNARY_OPS.has(ch) ? 3 : 2;
      const children: IdsNode[] = [];
      for (let i = 0; i < arity; i += 1) {
        const child = parseNode([...path, i]);
        if (!child) break;
        children.push(child);
      }
      return { op: ch, leaf: null, path, children };
    }
    return { op: null, leaf: ch, path, children: [] };
  };

  return parseNode([]);
}

function collectLeaves(node: IdsNode, out: IdsNode[]): void {
  if (node.leaf !== null) {
    out.push(node);
    return;
  }
  for (const child of node.children) {
    collectLeaves(child, out);
  }
}

function structureOf(root: IdsNode | null): CharacterStructure {
  const op = root?.op;
  if (!op) return 'simple';
  if (op === '⿰' || op === '⿲') return 'left-right';
  if (op === '⿱' || op === '⿳') return 'top-bottom';
  if (SURROUNDING_OPS.has(op)) return 'surrounding';
  return 'overlap';
}

function isPrefix(prefix: number[], of: number[]): boolean {
  if (prefix.length > of.length) return false;
  return prefix.every((v, i) => v === of[i]);
}

/**
 * Собирает уникальные компоненты декомпозиции.
 *
 * Повторяющиеся символы (напр. 纟×2 в 㡭) сливаются в один компонент,
 * черты обоих вхождений объединяются. Черта относится к компоненту,
 * если её путь в `matches` проходит через лист компонента или,
 * наоборот, лист лежит под subtree-путём черты (данные атрибутируют
 * такую черту сразу всей группе).
 */
function buildComponents(entry: RawEtymologyEntry, root: IdsNode | null): EtymologyComponent[] {
  if (!root || root.leaf !== null) return [];

  const leaves: IdsNode[] = [];
  collectLeaves(root, leaves);

  const grouped = new Map<string, IdsNode[]>();
  for (const leaf of leaves) {
    const ch = leaf.leaf!;
    if (ch === UNKNOWN_LEAF || ch === entry.character) continue;
    const list = grouped.get(ch);
    if (list) list.push(leaf);
    else grouped.set(ch, [leaf]);
  }

  const dataset = getEtymologyDataset();
  const matches = entry.matches ?? [];
  const components: EtymologyComponent[] = [];

  for (const [ch, nodes] of grouped) {
    const strokes: number[] = [];
    for (let i = 0; i < matches.length; i += 1) {
      const m = matches[i];
      if (!m) continue;
      if (nodes.some((n) => isPrefix(n.path, m) || isPrefix(m, n.path))) {
        strokes.push(i);
      }
    }
    const ref = dataset.get(ch) ?? null;
    const isPhonetic = entry.etymology?.phonetic === ch;
    const isSemantic = entry.etymology?.semantic === ch;
    components.push({
      character: ch,
      path: nodes[0]!.path,
      role: isPhonetic && isSemantic ? 'both' : isPhonetic ? 'phonetic' : isSemantic ? 'semantic' : null,
      meaningRu: ref?.definition_ru ?? null,
      pinyin: ref?.pinyin?.[0] ?? null,
      strokes,
    });
  }

  return components;
}

/**
 * Пустая «заглушка» для иероглифов, которых нет в датасете.
 * Не падает — возвращает `found: false`, чтобы UI мог показать
 * «нет данных по этому иероглифу».
 */
function emptyEtymology(character: string, pinyin: string | null): Etymology {
  return {
    character,
    pinyin,
    found: false,
    definitionRu: null,
    definitionEn: null,
    decomposition: null,
    structure: 'simple',
    strokeCount: null,
    radicalChar: null,
    radicalMeaningRu: null,
    etymologyType: null,
    etymologyTypeRu: null,
    hint: null,
    hintRu: null,
    phonetic: null,
    semantic: null,
    components: [],
    matches: null,
  };
}

/**
 * Достаёт этимологию одного иероглифа из датасета.
 *
 * Для слов из нескольких иероглифов берётся первый переданный
 * символ («喜欢» → «喜»); клиент при желании вызывает по каждому
 * символу отдельно.
 */
export function lookupEtymology(character: string, pinyin: string | null = null): Etymology {
  const ch = (character ?? '').trim();
  const firstChar = Array.from(ch)[0] ?? '';
  if (!firstChar) {
    return emptyEtymology('', pinyin);
  }

  const dataset = getEtymologyDataset();
  const entry = dataset.get(firstChar);
  if (!entry) {
    return emptyEtymology(firstChar, pinyin);
  }

  const root = entry.decomposition ? parseIds(entry.decomposition) : null;
  const ety = entry.etymology ?? null;
  const radical = entry.radical ?? null;
  const radicalRef = radical !== null ? (dataset.get(radical) ?? null) : null;

  return {
    character: firstChar,
    pinyin,
    found: true,
    definitionRu: entry.definition_ru ?? null,
    definitionEn: entry.definition ?? null,
    decomposition: entry.decomposition || null,
    structure: structureOf(root),
    strokeCount: entry.matches?.length ?? null,
    radicalChar: radical,
    radicalMeaningRu: radicalRef?.definition_ru ?? null,
    etymologyType: ety?.type ?? null,
    etymologyTypeRu: ety?.type_ru ?? null,
    hint: ety?.hint ?? null,
    hintRu: ety?.hint_ru ?? null,
    phonetic: ety?.phonetic ?? null,
    semantic: ety?.semantic ?? null,
    components: buildComponents(entry, root),
    matches: entry.matches ?? null,
  };
}

/**
 * Достаёт этимологию для всех уникальных иероглифов строки
 * (задел под «multi-character» карточку).
 */
export function lookupAllEtymologies(text: string): Etymology[] {
  const seen = new Set<string>();
  const out: Etymology[] = [];
  for (const ch of Array.from(text)) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(lookupEtymology(ch));
  }
  return out;
}
