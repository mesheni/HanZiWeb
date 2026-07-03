import { describe, it, expect } from 'vitest';
import {
  OAuthExchangeSchema,
  OAuthProfileSchema,
  OAuthProviderSchema,
  OAUTH_PROVIDER_LABELS,
  UserAccountSchema,
  UserAccountsResponseSchema,
} from '@hanzi/shared';

describe('OAuthProviderSchema', () => {
  it('accepts google / apple / yandex', () => {
    expect(OAuthProviderSchema.parse('google')).toBe('google');
    expect(OAuthProviderSchema.parse('apple')).toBe('apple');
    expect(OAuthProviderSchema.parse('yandex')).toBe('yandex');
  });

  it('rejects unknown providers', () => {
    expect(() => OAuthProviderSchema.parse('facebook')).toThrow();
    expect(() => OAuthProviderSchema.parse('')).toThrow();
  });
});

describe('OAUTH_PROVIDER_LABELS', () => {
  it('has a label for each provider', () => {
    expect(OAUTH_PROVIDER_LABELS.google).toBe('Google');
    expect(OAUTH_PROVIDER_LABELS.apple).toBe('Apple');
    expect(OAUTH_PROVIDER_LABELS.yandex).toBe('Яндекс');
  });
});

describe('OAuthProfileSchema', () => {
  it('validates a complete profile', () => {
    const parsed = OAuthProfileSchema.parse({
      provider: 'google',
      providerUserId: '12345',
      email: 'user@example.com',
      emailVerified: true,
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(parsed.provider).toBe('google');
    expect(parsed.emailVerified).toBe(true);
  });

  it('rejects profile without providerUserId', () => {
    expect(() =>
      OAuthProfileSchema.parse({
        provider: 'google',
        providerUserId: '',
        email: 'a@b.com',
      }),
    ).toThrow();
  });

  it('accepts profile with only required fields (emailVerified default false)', () => {
    const parsed = OAuthProfileSchema.parse({
      provider: 'yandex',
      providerUserId: 'abc',
    });
    expect(parsed.emailVerified).toBe(false);
    expect(parsed.email).toBeUndefined();
  });
});

describe('UserAccountSchema / UserAccountsResponseSchema', () => {
  it('parses accounts response with multiple providers', () => {
    const parsed = UserAccountsResponseSchema.parse({
      accounts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          provider: 'google',
          providerEmail: 'a@b.com',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          provider: 'yandex',
          providerEmail: null,
          createdAt: '2026-07-02T00:00:00.000Z',
        },
      ],
      canUnlink: true,
    });
    expect(parsed.accounts).toHaveLength(2);
    expect(parsed.canUnlink).toBe(true);
  });

  it('accepts empty accounts array', () => {
    const parsed = UserAccountsResponseSchema.parse({ accounts: [], canUnlink: false });
    expect(parsed.accounts).toEqual([]);
    expect(parsed.canUnlink).toBe(false);
  });

  it('rejects invalid uuid in account id', () => {
    expect(() => UserAccountSchema.parse({
      id: 'not-a-uuid',
      provider: 'google',
      providerEmail: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    })).toThrow();
  });
});

describe('OAuthExchangeSchema', () => {
  it('accepts a code of valid length', () => {
    const code = 'a'.repeat(32);
    expect(OAuthExchangeSchema.parse({ code }).code).toBe(code);
  });

  it('rejects too short code', () => {
    expect(() => OAuthExchangeSchema.parse({ code: 'short' })).toThrow();
  });

  it('rejects too long code', () => {
    expect(() => OAuthExchangeSchema.parse({ code: 'x'.repeat(200) })).toThrow();
  });
});
