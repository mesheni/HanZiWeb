import { describe, it, expect } from 'vitest';
import {
  buildProgressWhereForFilters,
  buildWordWhereForFilters,
  intersectWithTagFilter,
  intersectWordWithTagFilter,
} from './sessionFilters.js';
import type { SessionFilters } from '@hanzi/shared';

const deckScope = { deckWords: { some: { deckId: 'deck-1' } } };

describe('buildProgressWhereForFilters', () => {
  it('returns empty where when no filters provided', () => {
    const where = buildProgressWhereForFilters(undefined);
    expect(where).toEqual({});
  });

  it('applies minStability as gte', () => {
    const where = buildProgressWhereForFilters({ minStability: 5 });
    expect(where.stability).toEqual({ gte: 5 });
  });

  it('applies maxStability as lte', () => {
    const where = buildProgressWhereForFilters({ maxStability: 7 });
    expect(where.stability).toEqual({ lte: 7 });
  });

  it('combines minStability and maxStability as range', () => {
    const where = buildProgressWhereForFilters({ minStability: 1, maxStability: 7 });
    expect(where.stability).toEqual({ gte: 1, lte: 7 });
  });

  it('combines stability with deckScope (no audio/mnemonic)', () => {
    const where = buildProgressWhereForFilters(
      { minStability: 1, maxStability: 7 },
      deckScope,
    );
    expect(where.stability).toEqual({ gte: 1, lte: 7 });
    expect(where.word).toEqual({ is: deckScope });
  });

  it('onlyWithAudio translates to word.audioUrl NOT NULL', () => {
    const where = buildProgressWhereForFilters({ onlyWithAudio: true });
    expect(where.word).toEqual({ is: { audioUrl: { not: null } } });
  });

  it('onlyWithMnemonic translates to word.mnemonic NOT NULL', () => {
    const where = buildProgressWhereForFilters({ onlyWithMnemonic: true });
    expect(where.word).toEqual({ is: { mnemonic: { not: null } } });
  });

  it('combines onlyWithAudio + onlyWithMnemonic on word', () => {
    const where = buildProgressWhereForFilters({
      onlyWithAudio: true,
      onlyWithMnemonic: true,
    });
    expect(where.word).toEqual({
      is: { audioUrl: { not: null }, mnemonic: { not: null } },
    });
  });

  it('combines stability + audio + deckScope', () => {
    const where = buildProgressWhereForFilters(
      { minStability: 1, maxStability: 7, onlyWithAudio: true },
      deckScope,
    );
    expect(where.stability).toEqual({ gte: 1, lte: 7 });
    expect(where.word).toEqual({
      is: { audioUrl: { not: null }, ...deckScope },
    });
  });
});

describe('buildWordWhereForFilters', () => {
  it('returns empty where when no filters', () => {
    expect(buildWordWhereForFilters(undefined)).toEqual({});
  });

  it('onlyWithAudio -> audioUrl NOT NULL', () => {
    expect(buildWordWhereForFilters({ onlyWithAudio: true })).toEqual({
      audioUrl: { not: null },
    });
  });

  it('onlyWithMnemonic -> mnemonic NOT NULL', () => {
    expect(buildWordWhereForFilters({ onlyWithMnemonic: true })).toEqual({
      mnemonic: { not: null },
    });
  });

  it('combines audio + mnemonic', () => {
    expect(
      buildWordWhereForFilters({ onlyWithAudio: true, onlyWithMnemonic: true }),
    ).toEqual({ audioUrl: { not: null }, mnemonic: { not: null } });
  });

  it('wraps with AND when deckScope present', () => {
    const where = buildWordWhereForFilters({ onlyWithAudio: true }, deckScope);
    expect(where).toEqual({
      AND: [{ audioUrl: { not: null } }, deckScope],
    });
  });
});

describe('intersectWithTagFilter', () => {
  it('returns input unchanged when tagFilteredWordIds is null', () => {
    const input = { stability: { gte: 1 }, word: { is: deckScope } };
    expect(intersectWithTagFilter(input, null)).toBe(input);
  });

  it('adds id IN clause when word is not yet in where', () => {
    const out = intersectWithTagFilter({}, ['w1', 'w2']);
    expect(out.word).toEqual({ is: { id: { in: ['w1', 'w2'] } } });
  });

  it('merges with existing word.is conditions', () => {
    const out = intersectWithTagFilter(
      { word: { is: { audioUrl: { not: null } } } },
      ['w1'],
    );
    expect(out.word).toEqual({
      is: { audioUrl: { not: null }, id: { in: ['w1'] } },
    });
  });

  it('empty tagFilteredWordIds still applies empty id list (will match nothing)', () => {
    const out = intersectWithTagFilter({}, []);
    expect(out.word).toEqual({ is: { id: { in: [] } } });
  });
});

describe('intersectWordWithTagFilter', () => {
  it('returns input unchanged when tagFilteredWordIds is null', () => {
    const input = { audioUrl: { not: null } };
    expect(intersectWordWithTagFilter(input, null)).toBe(input);
  });

  it('overrides id when not yet set', () => {
    const out = intersectWordWithTagFilter({ audioUrl: { not: null } }, ['w1']);
    expect(out.id).toEqual({ in: ['w1'] });
    expect(out.audioUrl).toEqual({ not: null });
  });

  it('appends to AND when AND already present', () => {
    const out = intersectWordWithTagFilter(
      { AND: [{ audioUrl: { not: null } }, deckScope] },
      ['w1'],
    );
    expect(out.AND).toEqual([
      { audioUrl: { not: null } },
      deckScope,
      { id: { in: ['w1'] } },
    ]);
  });
});

describe('SessionFiltersSchema validation (smoke)', () => {
  // Импортируем динамически, чтобы не падать, если схема поменяется.
  it('accepts empty filters', async () => {
    const { SessionFiltersSchema } = await import('@hanzi/shared');
    expect(() => SessionFiltersSchema.parse({})).not.toThrow();
    expect(() => SessionFiltersSchema.parse(undefined)).not.toThrow();
  });

  it('accepts full filter set', async () => {
    const { SessionFiltersSchema } = await import('@hanzi/shared');
    const filters: SessionFilters = {
      minStability: 1,
      maxStability: 7,
      tags: ['11111111-1111-1111-1111-111111111111'],
      onlyWithAudio: true,
      onlyWithMnemonic: false,
    };
    expect(() => SessionFiltersSchema.parse(filters)).not.toThrow();
  });

  it('rejects negative minStability', async () => {
    const { SessionFiltersSchema } = await import('@hanzi/shared');
    expect(() =>
      SessionFiltersSchema.parse({ minStability: -1 }),
    ).toThrow();
  });

  it('rejects too many tags (>20)', async () => {
    const { SessionFiltersSchema } = await import('@hanzi/shared');
    const tags = Array.from({ length: 21 }, () =>
      '11111111-1111-1111-1111-111111111111',
    );
    expect(() => SessionFiltersSchema.parse({ tags })).toThrow();
  });

  it('rejects unknown fields (.strict)', async () => {
    const { SessionFiltersSchema } = await import('@hanzi/shared');
    expect(() =>
      SessionFiltersSchema.parse({ somethingElse: true }),
    ).toThrow();
  });
});
