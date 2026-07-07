import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FEATURE_FLAGS,
  evaluateFlag,
  evaluateAllFlags,
  getEffectiveConfig,
  getKnownFlagKeys,
  hashToBucket,
} from './flags.js';
import { practiceFlagKey } from '@hanzi/shared';

const CLOZE_KEY = practiceFlagKey('cloze');
const CLOZE_ENV_ENABLED = 'FEATURE_FLAG_PRACTICE_CLOZE_ENABLED';
const CLOZE_ENV_ROLLOUT = 'FEATURE_FLAG_PRACTICE_CLOZE_ROLLOUT';

function setClozeEnv(overrides: { enabled?: string; rollout?: string }): void {
  if (overrides.enabled === undefined) {
    delete process.env[CLOZE_ENV_ENABLED];
  } else {
    process.env[CLOZE_ENV_ENABLED] = overrides.enabled;
  }
  if (overrides.rollout === undefined) {
    delete process.env[CLOZE_ENV_ROLLOUT];
  } else {
    process.env[CLOZE_ENV_ROLLOUT] = overrides.rollout;
  }
}

describe('featureFlags', () => {
  beforeEach(() => {
    setClozeEnv({});
  });

  afterEach(() => {
    setClozeEnv({});
  });

  describe('FEATURE_FLAGS registry', () => {
    it('registers all 8 practice mode flags by default', () => {
      const keys = getKnownFlagKeys();
      expect(keys).toEqual(
        expect.arrayContaining([
          practiceFlagKey('flip-card'),
          practiceFlagKey('multiple-choice'),
          practiceFlagKey('reverse-choice'),
          practiceFlagKey('pinyin-input'),
          practiceFlagKey('tone-recognition'),
          practiceFlagKey('syllable-constructor'),
          practiceFlagKey('cloze'),
          practiceFlagKey('character_assembly'),
        ]),
      );
      expect(keys).toHaveLength(8);
    });

    it('all defaults are enabled with 100% rollout', () => {
      for (const key of getKnownFlagKeys()) {
        const cfg = FEATURE_FLAGS[key]!;
        expect(cfg.enabled).toBe(true);
        expect(cfg.rolloutPercent).toBe(100);
        expect(cfg.whitelist).toEqual([]);
      }
    });

    it('FEATURE_FLAGS is frozen (read-only at runtime)', () => {
      expect(Object.isFrozen(FEATURE_FLAGS)).toBe(true);
    });
  });

  describe('hashToBucket', () => {
    it('is deterministic for the same input', () => {
      expect(hashToBucket('practice:cloze:user-1')).toBe(hashToBucket('practice:cloze:user-1'));
    });

    it('produces a value in [0, 99]', () => {
      for (const input of [
        'practice:cloze:user-1',
        'practice:multiple-choice:user-2',
        'practice:flip-card:user-3',
        'practice:pinyin-input:anonymous',
      ]) {
        const bucket = hashToBucket(input);
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThan(100);
        expect(Number.isInteger(bucket)).toBe(true);
      }
    });

    it('different inputs generally produce different buckets', () => {
      const buckets = new Set<number>();
      for (let i = 0; i < 100; i++) {
        buckets.add(hashToBucket(`practice:cloze:user-${i}`));
      }
      expect(buckets.size).toBeGreaterThan(50);
    });
  });

  describe('evaluateFlag (registry lookup)', () => {
    it('returns reason=unknown for an unregistered key', () => {
      const result = evaluateFlag('nonexistent:flag', 'user-1');
      expect(result).toEqual({ key: 'nonexistent:flag', enabled: false, reason: 'unknown' });
    });

    it('returns reason=disabled when enabled=false (via ENV)', () => {
      setClozeEnv({ enabled: 'false' });
      const result = evaluateFlag(CLOZE_KEY, 'user-1');
      expect(result).toEqual({ key: CLOZE_KEY, enabled: false, reason: 'disabled' });
    });

    it('returns enabled=true with reason=rollout when rolloutPercent=100', () => {
      setClozeEnv({ rollout: '100' });
      const result = evaluateFlag(CLOZE_KEY, 'user-1');
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('rollout');
    });

    it('returns enabled=false with reason=disabled when rolloutPercent=0', () => {
      setClozeEnv({ rollout: '0' });
      const result = evaluateFlag(CLOZE_KEY, 'user-1');
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('disabled');
    });

    it('rolloutPercent=50 splits a known population roughly in half', () => {
      setClozeEnv({ rollout: '50' });
      let enabledCount = 0;
      const total = 1000;
      for (let i = 0; i < total; i++) {
        if (evaluateFlag(CLOZE_KEY, `user-${i}`).enabled) enabledCount++;
      }
      expect(enabledCount).toBeGreaterThan(total * 0.4);
      expect(enabledCount).toBeLessThan(total * 0.6);
    });

    it('produces stable buckets for the same userId across calls', () => {
      setClozeEnv({ rollout: '30' });
      const a = evaluateFlag(CLOZE_KEY, 'stable-user-42');
      const b = evaluateFlag(CLOZE_KEY, 'stable-user-42');
      const c = evaluateFlag(CLOZE_KEY, 'stable-user-42');
      expect(a).toEqual(b);
      expect(b).toEqual(c);
    });

    it('anonymous users fall back to a stable anonymous bucket', () => {
      setClozeEnv({ rollout: '50' });
      const r1 = evaluateFlag(CLOZE_KEY, null);
      const r2 = evaluateFlag(CLOZE_KEY, undefined);
      const r3 = evaluateFlag(CLOZE_KEY);
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });

    it('returns the same result for the same userId regardless of ENV timing', () => {
      setClozeEnv({ rollout: '25' });
      const before = evaluateFlag(CLOZE_KEY, 'sticky-user');
      setClozeEnv({ rollout: '75' });
      const after = evaluateFlag(CLOZE_KEY, 'sticky-user');
      expect(before.enabled).toBe(after.enabled);
    });
  });

  describe('ENV overrides', () => {
    it('FEATURE_FLAG_*_ENABLED=false disables the flag', () => {
      setClozeEnv({ enabled: 'false' });
      const result = evaluateFlag(CLOZE_KEY, 'user-1');
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('disabled');
    });

    it('FEATURE_FLAG_*_ENABLED=true + ROLLOUT=0 keeps it disabled (master switch wins)', () => {
      setClozeEnv({ enabled: 'true', rollout: '0' });
      const result = evaluateFlag(CLOZE_KEY, 'user-1');
      expect(result.enabled).toBe(false);
    });

    it('FEATURE_FLAG_*_ROLLOUT=0 forces 0% rollout', () => {
      setClozeEnv({ rollout: '0' });
      const result = evaluateFlag(CLOZE_KEY, 'user-1');
      expect(result.enabled).toBe(false);
    });

    it('FEATURE_FLAG_*_ROLLOUT=25 narrows the rollout to 25%', () => {
      setClozeEnv({ rollout: '25' });
      let enabledCount = 0;
      for (let i = 0; i < 1000; i++) {
        if (evaluateFlag(CLOZE_KEY, `user-${i}`).enabled) {
          enabledCount++;
        }
      }
      expect(enabledCount).toBeGreaterThan(150);
      expect(enabledCount).toBeLessThan(350);
    });

    it('ignores invalid ROLLOUT values (out of range)', () => {
      setClozeEnv({ rollout: '150' });
      const cfg = getEffectiveConfig(CLOZE_KEY);
      expect(cfg?.rolloutPercent).toBe(100);
    });

    it('ignores non-numeric ROLLOUT values', () => {
      setClozeEnv({ rollout: 'banana' });
      const cfg = getEffectiveConfig(CLOZE_KEY);
      expect(cfg?.rolloutPercent).toBe(100);
    });

    it('returns null for an unknown key in getEffectiveConfig', () => {
      expect(getEffectiveConfig('nonexistent:flag')).toBeNull();
    });
  });

  describe('evaluateAllFlags', () => {
    it('returns an evaluation for every registered flag', () => {
      const result = evaluateAllFlags('user-1');
      const keys = getKnownFlagKeys();
      expect(Object.keys(result).sort()).toEqual([...keys].sort());
      for (const k of keys) {
        expect(result[k]).toBeDefined();
        expect(result[k]!.key).toBe(k);
      }
    });

    it('defaults are all enabled for an arbitrary user', () => {
      const result = evaluateAllFlags('user-1');
      for (const eval_ of Object.values(result)) {
        expect(eval_.enabled).toBe(true);
      }
    });
  });
});
