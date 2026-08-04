import { describe, it, expect } from 'vitest';
import {
  PracticeTypeSchema,
  TestQuestionTypeSchema,
  practiceTypeToTestType,
  testTypeToPracticeType,
} from '@hanzi/shared';

// Маппинг практика ↔ тест (PLAN_Features_v0.4 §43): разделители
// расходятся намеренно (underscore vs hyphen), конвертация живёт
// в одном месте и не должна давать случайных пересечений.

describe('practiceTypeToTestType (PLAN_Features_v0.4 §43)', () => {
  it('maps every supported practice to its test type', () => {
    expect(practiceTypeToTestType('multiple-choice')).toBe('multiple-choice-translation');
    expect(practiceTypeToTestType('reverse-choice')).toBe('reverse-choice-character');
    expect(practiceTypeToTestType('pinyin-input')).toBe('pinyin-input');
    expect(practiceTypeToTestType('tone-recognition')).toBe('tone-recognition');
    expect(practiceTypeToTestType('character_assembly')).toBe('character-assembly');
    expect(practiceTypeToTestType('cloze')).toBe('cloze');
  });

  it('returns null for practices without a test analogue', () => {
    expect(practiceTypeToTestType('flip-card')).toBeNull();
    expect(practiceTypeToTestType('syllable-constructor')).toBeNull();
  });

  it('never returns a value that collides with the practice string set', () => {
    // Расхождение «character_assembly» vs «character-assembly» должно
    // конвертироваться, а не проходить строкой дальше. Типы, которые
    // совпадают дословно (pinyin-input, tone-recognition), — законные
    // самосоответствия, их пропускаем.
    const practiceValues = new Set<string>(PracticeTypeSchema.options);
    for (const p of PracticeTypeSchema.options) {
      const t = practiceTypeToTestType(p);
      if (t && t !== p) {
        expect(practiceValues.has(t), `test type '${t}' must not collide with practice types`).toBe(
          false,
        );
      }
    }
  });

  it('round-trips through the test set: every test type maps back', () => {
    for (const t of TestQuestionTypeSchema.options) {
      const p = testTypeToPracticeType(t);
      expect(practiceTypeToTestType(p)).toBe(t);
    }
  });
});
