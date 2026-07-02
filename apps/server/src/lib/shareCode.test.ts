import { describe, it, expect } from 'vitest';
import {
  generateShareCode,
  isValidShareCode,
  normalizeShareCode,
  SHARE_CODE_ALPHABET,
} from './shareCode.js';

describe('generateShareCode', () => {
  it('returns a code of the requested length', () => {
    expect(generateShareCode(6)).toHaveLength(6);
    expect(generateShareCode(8)).toHaveLength(8);
    expect(generateShareCode(4)).toHaveLength(4);
  });

  it('uses only chars from the unambiguous alphabet', () => {
    const code = generateShareCode(64);
    for (const ch of code) {
      expect(SHARE_CODE_ALPHABET).toContain(ch);
    }
  });

  it('excludes ambiguous chars (0, O, 1, I, L)', () => {
    // Генерируем много кодов и проверяем отсутствие «плохих» символов.
    for (let i = 0; i < 50; i++) {
      const code = generateShareCode(10);
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });

  it('is deterministic with a seeded random', () => {
    const seeded = () => 0.5;
    expect(generateShareCode(6, seeded)).toBe(generateShareCode(6, seeded));
  });

  it('throws on non-positive length', () => {
    expect(() => generateShareCode(0)).toThrow();
    expect(() => generateShareCode(-1)).toThrow();
  });
});

describe('isValidShareCode', () => {
  it('accepts 4–16 chars from the alphabet', () => {
    expect(isValidShareCode('AB23')).toBe(true);
    expect(isValidShareCode('ABCDEFGH')).toBe(true);
    expect(isValidShareCode('K3D9P2')).toBe(true);
  });

  it('rejects too short or too long', () => {
    expect(isValidShareCode('AB')).toBe(false);
    expect(isValidShareCode('A')).toBe(false);
    expect(isValidShareCode('A'.repeat(17))).toBe(false);
  });

  it('rejects lowercase and non-alphanumeric', () => {
    expect(isValidShareCode('abcd')).toBe(false);
    expect(isValidShareCode('AB-12')).toBe(false);
    expect(isValidShareCode('AB 12')).toBe(false);
  });
});

describe('normalizeShareCode', () => {
  it('uppercases and trims whitespace', () => {
    expect(normalizeShareCode('  abcd  ')).toBe('ABCD');
    expect(normalizeShareCode('k3d9p2')).toBe('K3D9P2');
    expect(normalizeShareCode('\tXYZ\n')).toBe('XYZ');
  });
});
