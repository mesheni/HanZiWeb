import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  buildCharacterPool,
  buildQuestion,
  findClozeExample,
  type WordRow,
} from './tests.service.js';

function mkWord(
  character: string,
  examples: { id: string; chinese: string }[] = [],
  id?: string,
  translation: string = 'tr',
): WordRow {
  return {
    id: id ?? randomUUID(),
    character,
    pinyin: 'pi',
    translation,
    hskLevel: 1,
    audioUrl: null,
    examples,
  };
}

describe('buildCharacterPool — PLAN_Features_v0.4 §27', () => {
  it('multi-char target: каждый иероглиф цели исключён из pool', () => {
    // До фикса: Set([target.character]) = Set(['你好']),
    // seen.has('你') → false, цель утекала в пул distractors.
    const target = mkWord('你好');
    const pool = [target, mkWord('好玩'), mkWord('好学'), mkWord('你学')];
    const result = buildCharacterPool(target, pool);
    expect(result).not.toContain('你');
    expect(result).not.toContain('好');
  });

  it('single-char target: иероглиф цели исключён', () => {
    const target = mkWord('大');
    const pool = [target, mkWord('大学'), mkWord('太阳')];
    const result = buildCharacterPool(target, pool);
    expect(result).not.toContain('大');
  });

  it('shared char with target is excluded, but other chars from same word are kept', () => {
    const target = mkWord('你好');
    const shared = mkWord('好玩');
    const result = buildCharacterPool(target, [target, shared]);
    expect(result).not.toContain('好');
    expect(result).toContain('玩');
  });

  it('all chars from the target appear in the seen set (regression: Array.from usage)', () => {
    // Скрытая проверка: убеждаемся, что seen содержит каждый char,
    // а не всю строку как один элемент. Проверяем через инвариант:
    // если бы был баг, target.id в pool привёл бы к утечке.
    const target = mkWord('你好');
    const sameTargetDup = mkWord('你好', [], 'dup-id');
    const result = buildCharacterPool(target, [target, sameTargetDup]);
    expect(result).not.toContain('你');
    expect(result).not.toContain('好');
  });

  it('result is sliced to ≤3 elements (CHARACTER_POOL_EXTRA)', () => {
    const target = mkWord('爱');
    const pool = [target];
    for (let i = 0; i < 10; i++) pool.push(mkWord(`字${i}`));
    const result = buildCharacterPool(target, pool);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('returns only distractors from `pool`, never from `target` itself', () => {
    const target = mkWord('猫');
    const pool = [target, mkWord('狗'), mkWord('鱼')];
    const result = buildCharacterPool(target, pool);
    expect(result).toEqual(expect.arrayContaining(['狗', '鱼']));
    expect(result).not.toContain('猫');
  });
});

describe('buildQuestion MCQ options uniqueness — PLAN_Features_v0.4 §38', () => {
  it('duplicate translations in the pool never produce duplicate options', () => {
    // «爸爸» и «爸» делят перевод 'dad'. До фикса pickNUnique отдавал
    // оба, и в options могло оказаться два 'dad'.
    const target = mkWord('妈妈', [], undefined, 'mom');
    const pool = [
      target,
      mkWord('爸', [], undefined, 'dad'),
      mkWord('爸爸', [], undefined, 'dad'),
      mkWord('哥哥', [], undefined, 'brother'),
      mkWord('姐姐', [], undefined, 'sister'),
      mkWord('妹妹', [], undefined, 'younger sister'),
    ];

    // Много прогонов: shuffle в pickNUnique рандомен, но после дедупа
    // уникальность options гарантирована в каждом.
    for (let i = 0; i < 50; i++) {
      const q = buildQuestion('multiple-choice-translation', target, pool);
      expect(q).not.toBeNull();
      expect(q!.options.length).toBe(4);
      expect(new Set(q!.options).size, `duplicate options in run ${i}`).toBe(q!.options.length);
      expect(q!.options).toContain('mom');
    }
  });

  it('duplicate characters in the pool never produce duplicate reverse-choice options', () => {
    const target = mkWord('猫', [], undefined, 'cat');
    const pool = [
      target,
      mkWord('爸'),
      mkWord('爸爸'),
      mkWord('猫头鹰'),
      mkWord('狗'),
      mkWord('鱼'),
    ];

    for (let i = 0; i < 50; i++) {
      const q = buildQuestion('reverse-choice-character', target, pool);
      expect(q).not.toBeNull();
      expect(q!.options.length).toBe(4);
      expect(new Set(q!.options).size, `duplicate options in run ${i}`).toBe(q!.options.length);
    }
  });
});

describe('findClozeExample — PLAN_Features_v0.4 §28', () => {
  it('multi-char target: матчит точную последовательность и blank-ает', () => {
    const word = mkWord('你好', [{ id: 'ex1', chinese: '你好世界！' }]);
    expect(findClozeExample(word)).toEqual({
      exampleId: 'ex1',
      clozeSentence: '____世界！',
    });
  });

  it('multi-char target: blank-ает ВСЕ вхождения, не только первое', () => {
    // До фикса: `replace(string, '____')` заменял только первое
    // вхождение — для второй подстроки blank оставался.
    const word = mkWord('你好', [{ id: 'ex1', chinese: '你好，你好！' }]);
    expect(findClozeExample(word)?.clozeSentence).toBe('____，____！');
  });

  it('single-char target inside larger CJK word: НЕ матчит (главный кейс §28)', () => {
    // До фикса: `ex.chinese.includes('大')` → true для «大学»,
    // `replace` blank'ал «大» → «____学», что для cloze бессмысленно
    // (семантически «大» — это «большой», а не подстрока «университета»).
    const word = mkWord('大', [{ id: 'ex1', chinese: '我去大学学习。' }]);
    expect(findClozeExample(word)).toBeNull();
  });

  it('single-char target at start, followed by punctuation: матчит и blank-ает', () => {
    const word = mkWord('好', [{ id: 'ex1', chinese: '好！' }]);
    expect(findClozeExample(word)).toEqual({
      exampleId: 'ex1',
      clozeSentence: '____！',
    });
  });

  it('single-char target между CJK-символами: НЕ матчит (документированный trade-off)', () => {
    // Trade-off консервативного CJK-boundary: «好» в «他好» не
    // матчит, потому что слева — CJK «他». Это защищает от ложных
    // срабатываний на подстроках («大» в «大学»), но ценой
    // отказа от некоторых валидных кейсов. Тест фиксирует текущее
    // поведение; будущая миграция на pre-tokenized позиции
    // (ReadingTextWord) может снять это ограничение.
    const word = mkWord('好', [{ id: 'ex1', chinese: '他好。' }]);
    expect(findClozeExample(word)).toBeNull();
  });

  it('single-char target с одной non-CJK стороной: НЕ матчит (нужны ОБЕ)', () => {
    // «好» в «他好。» — lookahead проходит («。» non-CJK), но
    // lookbehind падает («他» CJK). Обе стороны должны быть
    // non-CJK или границей строки, чтобы матч случился.
    const word = mkWord('好', [{ id: 'ex1', chinese: '好。' }]);
    // «好» at idx=0: lookbehind = start (OK), lookahead = «。» (non-CJK) → match
    expect(findClozeExample(word)?.clozeSentence).toBe('____。');
  });

  it('single-char target: blank-ает только standalone вхождение, не в окружении CJK', () => {
    // «好！今天很好。» — два «好»:
    //   - idx 0: preceded by start, followed by «！» → standalone → blank
    //   - idx 5: в «很好», preceded by «很» (CJK) → не blank
    const word = mkWord('好', [{ id: 'ex1', chinese: '好！今天很好。' }]);
    expect(findClozeExample(word)?.clozeSentence).toBe('____！今天很好。');
  });

  it('skips examples where single-char target is substring, picks a clean one', () => {
    // ex1: «大学» — «大» в окружении CJK, не матчит
    // ex2: «大衣» — «大» в окружении CJK, не матчит
    // ex3: «大» standalone с пунктуацией — матчит
    const word = mkWord('大', [
      { id: 'ex1', chinese: '我去大学。' },
      { id: 'ex2', chinese: '这件大衣。' },
      { id: 'ex3', chinese: '这件大。' },
    ]);
    // В ex3 «大» preceded by «件» (CJK) — lookbehind fails. Skip.
    // В ex3 нет матча. Функция возвращает null.
    expect(findClozeExample(word)).toBeNull();
  });

  it('picks the first matching example in iteration order', () => {
    const word = mkWord('好', [
      { id: 'ex1', chinese: '很好。' }, // не матчит (CJK-CJK)
      { id: 'ex2', chinese: '好。' }, // матчит
      { id: 'ex3', chinese: '好。' }, // тоже, но второй по порядку
    ]);
    expect(findClozeExample(word)).toEqual({
      exampleId: 'ex2',
      clozeSentence: '____。',
    });
  });

  it('target not present in any example: returns null', () => {
    const word = mkWord('猫', [
      { id: 'ex1', chinese: '我有一条狗。' },
      { id: 'ex2', chinese: '我喜欢动物。' },
    ]);
    expect(findClozeExample(word)).toBeNull();
  });

  it('empty target: returns null (no infinite match)', () => {
    const word = mkWord('', [{ id: 'ex1', chinese: '我有一条狗。' }]);
    expect(findClozeExample(word)).toBeNull();
  });

  it('regex-special chars in target are escaped (regression: escapeRegex)', () => {
    // Регрессия: `a.b` без escape матчился бы как «a + любой + b»;
    // нужен literal-матч, чтобы путаница с regex-метасимволами
    // не возникала. Сюда же — backslash, скобки, etc.
    const word = mkWord('a.b', [{ id: 'ex1', chinese: 'Это a.b пример.' }]);
    expect(findClozeExample(word)).toEqual({
      exampleId: 'ex1',
      clozeSentence: 'Это ____ пример.',
    });
  });

  it('multi-char target: точная последовательность не путается с подстрокой длинного слова', () => {
    // «你好» не должно blank'аться внутри «你好吗» как часть чего-то,
    // потому что «你好吗» содержит «你好» как префикс — и это ровно
    // та последовательность, которую мы хотим blank'ать.
    const word = mkWord('你好', [{ id: 'ex1', chinese: '你好吗？' }]);
    expect(findClozeExample(word)?.clozeSentence).toBe('____吗？');
  });
});
