import { describe, it, expect } from 'vitest';
import {
  TagSchema,
  CreateTagSchema,
  SetWordTagsSchema,
  SessionFiltersSchema,
  StartSessionSchema,
} from '@hanzi/shared';

describe('TagSchema', () => {
  it('accepts a valid tag', () => {
    const tag = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'С трудным тоном',
      slug: 'hard-tones',
      color: 'FFB74D',
      createdAt: '2026-07-04T00:00:00.000Z',
    };
    expect(() => TagSchema.parse(tag)).not.toThrow();
  });

  it('accepts null color', () => {
    const tag = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Foo',
      slug: 'foo',
      color: null,
      createdAt: '2026-07-04T00:00:00.000Z',
    };
    expect(() => TagSchema.parse(tag)).not.toThrow();
  });

  it('rejects invalid slug (uppercase)', () => {
    const tag = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Foo',
      slug: 'Hard-Tones',
      color: null,
      createdAt: '2026-07-04T00:00:00.000Z',
    };
    expect(() => TagSchema.parse(tag)).toThrow();
  });

  it('rejects invalid color (not 6 hex chars)', () => {
    const tag = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Foo',
      slug: 'foo',
      color: 'red',
      createdAt: '2026-07-04T00:00:00.000Z',
    };
    expect(() => TagSchema.parse(tag)).toThrow();
  });
});

describe('CreateTagSchema', () => {
  it('accepts minimal input (name + slug)', () => {
    expect(() => CreateTagSchema.parse({ name: 'X', slug: 'x' })).not.toThrow();
  });

  it('accepts input with color', () => {
    expect(() =>
      CreateTagSchema.parse({ name: 'X', slug: 'x', color: 'FFB74D' }),
    ).not.toThrow();
  });

  it('rejects empty name', () => {
    expect(() => CreateTagSchema.parse({ name: '', slug: 'x' })).toThrow();
  });

  it('rejects empty slug', () => {
    expect(() => CreateTagSchema.parse({ name: 'X', slug: '' })).toThrow();
  });
});

describe('SetWordTagsSchema', () => {
  it('accepts empty array (clears all tags)', () => {
    expect(() => SetWordTagsSchema.parse({ tagIds: [] })).not.toThrow();
  });

  it('accepts up to 20 tag ids', () => {
    const tagIds = Array.from({ length: 20 }, () =>
      '11111111-1111-1111-1111-111111111111',
    );
    expect(() => SetWordTagsSchema.parse({ tagIds })).not.toThrow();
  });

  it('rejects >20 tag ids', () => {
    const tagIds = Array.from({ length: 21 }, () =>
      '11111111-1111-1111-1111-111111111111',
    );
    expect(() => SetWordTagsSchema.parse({ tagIds })).toThrow();
  });

  it('rejects non-uuid strings', () => {
    expect(() => SetWordTagsSchema.parse({ tagIds: ['not-a-uuid'] })).toThrow();
  });
});

describe('SessionFiltersSchema (PLAN_Features_v0.2 §12)', () => {
  it('accepts empty filters', () => {
    expect(() => SessionFiltersSchema.parse({})).not.toThrow();
  });

  it('accepts undefined (no filter)', () => {
    expect(() => SessionFiltersSchema.parse(undefined)).not.toThrow();
  });

  it('accepts full filter set', () => {
    expect(() =>
      SessionFiltersSchema.parse({
        minStability: 1,
        maxStability: 7,
        tags: ['11111111-1111-1111-1111-111111111111'],
        onlyWithAudio: true,
        onlyWithMnemonic: false,
      }),
    ).not.toThrow();
  });

  it('rejects negative minStability', () => {
    expect(() => SessionFiltersSchema.parse({ minStability: -1 })).toThrow();
  });

  it('rejects too many tags (>20)', () => {
    const tags = Array.from({ length: 21 }, () =>
      '11111111-1111-1111-1111-111111111111',
    );
    expect(() => SessionFiltersSchema.parse({ tags })).toThrow();
  });

  it('rejects unknown fields (.strict)', () => {
    expect(() =>
      SessionFiltersSchema.parse({ somethingElse: true }),
    ).toThrow();
  });
});

describe('StartSessionSchema with filters', () => {
  it('filters is optional and defaults to undefined', () => {
    const parsed = StartSessionSchema.parse({});
    expect(parsed.filters).toBeUndefined();
  });

  it('accepts filters', () => {
    const parsed = StartSessionSchema.parse({
      filters: { minStability: 1, maxStability: 7, onlyWithAudio: true },
    });
    expect(parsed.filters?.minStability).toBe(1);
    expect(parsed.filters?.maxStability).toBe(7);
    expect(parsed.filters?.onlyWithAudio).toBe(true);
  });

  it('rejects invalid filter shape', () => {
    expect(() =>
      StartSessionSchema.parse({ filters: { minStability: 'abc' } }),
    ).toThrow();
  });
});
