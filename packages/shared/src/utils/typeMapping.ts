import type { PracticeType } from '../schemas/session.js';
import type { TestQuestionType } from '../schemas/test.js';

/**
 * Маппинг между типом практики (`PracticeType`, подчёркивание:
 * `character_assembly`) и типом вопроса теста (`TestQuestionType`,
 * дефис: `character-assembly`). Разделители расходятся исторически —
 * это публичные контракты API, менять их строки нельзя без breaking
 * change, поэтому конвертация вынесена в одно место, чтобы случайные
 * строковые lookup'ы не пересекали наборы (PLAN_Features_v0.4 §43).
 *
 * Не все практики имеют тестовый аналог: `flip-card` и
 * `syllable-constructor` → `null` в прямом маппинге.
 */
export const PRACTICE_TO_TEST_TYPE: Readonly<Partial<Record<PracticeType, TestQuestionType>>> = {
  'multiple-choice': 'multiple-choice-translation',
  'reverse-choice': 'reverse-choice-character',
  'pinyin-input': 'pinyin-input',
  'tone-recognition': 'tone-recognition',
  character_assembly: 'character-assembly',
  cloze: 'cloze',
};

/** Каждый тип теста имеет ровно один тип практики (обратный маппинг). */
export const TEST_TO_PRACTICE_TYPE: Readonly<Record<TestQuestionType, PracticeType>> = {
  'multiple-choice-translation': 'multiple-choice',
  'reverse-choice-character': 'reverse-choice',
  'pinyin-input': 'pinyin-input',
  'tone-recognition': 'tone-recognition',
  'character-assembly': 'character_assembly',
  cloze: 'cloze',
};

/** PracticeType → TestQuestionType; `null`, если тестового аналога нет. */
export function practiceTypeToTestType(type: PracticeType): TestQuestionType | null {
  return PRACTICE_TO_TEST_TYPE[type] ?? null;
}

/** TestQuestionType → PracticeType (всегда определён). */
export function testTypeToPracticeType(type: TestQuestionType): PracticeType {
  return TEST_TO_PRACTICE_TYPE[type];
}
