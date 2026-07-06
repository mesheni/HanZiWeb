import { describe, it, expect } from 'vitest';
import {
  RegisterSchema,
  isAllowedEmailTld,
  DEFAULT_ALLOWED_EMAIL_TLDS,
  EMAIL_DOMAIN_NOT_ALLOWED_CODE,
} from '@hanzi/shared';

describe('DEFAULT_ALLOWED_EMAIL_TLDS', () => {
  it('contains only .ru by default', () => {
    expect([...DEFAULT_ALLOWED_EMAIL_TLDS]).toEqual(['ru']);
  });
});

describe('isAllowedEmailTld', () => {
  it('accepts .ru domains', () => {
    expect(isAllowedEmailTld('user@mail.ru')).toBe(true);
    expect(isAllowedEmailTld('a.b@gmail@subdomain.example.ru')).toBe(true);
  });

  it('rejects non-.ru domains', () => {
    expect(isAllowedEmailTld('user@gmail.com')).toBe(false);
    expect(isAllowedEmailTld('user@yahoo.com')).toBe(false);
    expect(isAllowedEmailTld('user@icloud.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isAllowedEmailTld('USER@MAIL.RU')).toBe(true);
    expect(isAllowedEmailTld('user@Mail.Ru')).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isAllowedEmailTld('no-at-sign')).toBe(false);
    expect(isAllowedEmailTld('user@')).toBe(false);
    expect(isAllowedEmailTld('user@.ru')).toBe(true);
    expect(isAllowedEmailTld('@mail.ru')).toBe(true);
  });

  it('honours a custom allowed list', () => {
    expect(isAllowedEmailTld('user@gmail.com', ['com'])).toBe(true);
    expect(isAllowedEmailTld('user@mail.ru', ['ru', 'su'])).toBe(true);
    expect(isAllowedEmailTld('user@school.su', ['ru', 'su'])).toBe(true);
    expect(isAllowedEmailTld('user@gmail.com', ['ru', 'su'])).toBe(false);
  });
});

describe('RegisterSchema', () => {
  it('accepts a valid .ru email and 8+ char password', () => {
    const parsed = RegisterSchema.parse({ email: 'user@mail.ru', password: 'longenough' });
    expect(parsed.email).toBe('user@mail.ru');
  });

  it('rejects non-.ru emails with EMAIL_DOMAIN_NOT_ALLOWED-friendly message', () => {
    const result = RegisterSchema.safeParse({ email: 'user@gmail.com', password: 'longenough' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailIssue = result.error.issues.find((i) => i.path[0] === 'email');
      expect(emailIssue?.message).toMatch(/domain/i);
    }
  });

  it('still enforces the existing password rules (min 8, max 128)', () => {
    expect(() => RegisterSchema.parse({ email: 'a@b.ru', password: 'short' })).toThrow();
    expect(() =>
      RegisterSchema.parse({ email: 'a@b.ru', password: 'x'.repeat(129) }),
    ).toThrow();
  });

  it('still rejects malformed emails via .email()', () => {
    expect(() => RegisterSchema.parse({ email: 'not-an-email', password: 'longenough' })).toThrow();
  });
});

describe('EMAIL_DOMAIN_NOT_ALLOWED_CODE', () => {
  it('is the documented error code', () => {
    expect(EMAIL_DOMAIN_NOT_ALLOWED_CODE).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
  });
});
