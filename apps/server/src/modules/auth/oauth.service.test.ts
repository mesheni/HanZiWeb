import { describe, it, expect } from 'vitest';
import {
  buildOAuthRedirectUrl,
  computeCanUnlink,
  displayNameFromEmail,
  generateExchangeCode,
} from './oauth.service.js';

describe('generateExchangeCode', () => {
  it('returns a base64url string of at least 32 chars', () => {
    const code = generateExchangeCode();
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThanOrEqual(43); // 32 bytes -> 43 chars base64url
    // base64url alphabet: A-Z a-z 0-9 - _
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces unique codes', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateExchangeCode()));
    expect(codes.size).toBe(50);
  });
});

describe('computeCanUnlink', () => {
  it('returns false when no accounts and no password', () => {
    expect(computeCanUnlink([], false)).toBe(false);
  });

  it('returns false when no accounts (nothing to unlink)', () => {
    expect(computeCanUnlink([], true)).toBe(false);
  });

  it('returns false for single social account without password (lock-out)', () => {
    expect(computeCanUnlink([{ provider: 'google' }], false)).toBe(false);
  });

  it('returns true for single social account with password', () => {
    expect(computeCanUnlink([{ provider: 'google' }], true)).toBe(true);
  });

  it('returns true for multiple social accounts even without password', () => {
    expect(computeCanUnlink([{ provider: 'google' }, { provider: 'yandex' }], false)).toBe(true);
  });
});

describe('displayNameFromEmail', () => {
  it('extracts local part of email', () => {
    expect(displayNameFromEmail('alice@gmail.com')).toBe('alice');
    expect(displayNameFromEmail('very.long.name@example.org')).toBe('very.long.name');
  });

  it('returns null for null/undefined/empty', () => {
    expect(displayNameFromEmail(null)).toBeNull();
    expect(displayNameFromEmail(undefined)).toBeNull();
    expect(displayNameFromEmail('')).toBeNull();
  });

  it('returns null for malformed email', () => {
    expect(displayNameFromEmail('no-at-sign')).toBeNull();
    expect(displayNameFromEmail('@nouser.com')).toBeNull();
  });
});

describe('buildOAuthRedirectUrl', () => {
  const base = 'http://localhost:5173';

  it('encodes provider and code in query', () => {
    const url = buildOAuthRedirectUrl(base, {
      provider: 'google',
      code: 'abc123',
    });
    expect(url).toBe('http://localhost:5173/auth/callback?provider=google&code=abc123');
  });

  it('encodes provider and error in query (no code)', () => {
    const url = buildOAuthRedirectUrl(base, {
      provider: 'yandex',
      error: 'access_denied',
    });
    expect(url).toBe('http://localhost:5173/auth/callback?provider=yandex&error=access_denied');
  });

  it('URL-encodes special characters in error', () => {
    const url = buildOAuthRedirectUrl(base, {
      provider: 'apple',
      error: 'invalid state & stuff',
    });
    expect(url).toContain('error=invalid+state+%26+stuff');
  });
});
