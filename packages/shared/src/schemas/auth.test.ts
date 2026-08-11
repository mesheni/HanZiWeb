import { describe, it, expect } from 'vitest';
import {
  RegisterSchema,
  LoginSchema,
  AuthResponseSchema,
  ChangePasswordSchema,
  ResetPasswordSchema,
  isAllowedEmailTld,
  DEFAULT_ALLOWED_EMAIL_TLDS,
} from './auth';

describe('RegisterSchema (F31)', () => {
  it('принимает .ru email и пароль 8+ символов', () => {
    const parsed = RegisterSchema.parse({ email: 'user@example.ru', password: 'secret-123' });
    expect(parsed.email).toBe('user@example.ru');
  });

  it('отклоняет email не из .ru (152-ФЗ политика)', () => {
    const res = RegisterSchema.safeParse({ email: 'user@gmail.com', password: 'secret-123' });
    expect(res.success).toBe(false);
  });

  it('отклоняет короткий пароль (< 8)', () => {
    const res = RegisterSchema.safeParse({ email: 'user@example.ru', password: 'short' });
    expect(res.success).toBe(false);
  });
});

describe('isAllowedEmailTld (F31)', () => {
  it('нормализует регистр домена', () => {
    expect(isAllowedEmailTld('user@example.RU')).toBe(true);
  });

  it('false без @ или точки в домене', () => {
    expect(isAllowedEmailTld('no-at-sign')).toBe(false);
    expect(isAllowedEmailTld('user@localhost')).toBe(false);
  });

  it('работает с кастомным списком TLD', () => {
    expect(isAllowedEmailTld('user@x.com', ['com'])).toBe(true);
    expect(isAllowedEmailTld('user@x.ru', ['com'])).toBe(false);
  });

  it('дефолтный список — только .ru', () => {
    expect(DEFAULT_ALLOWED_EMAIL_TLDS).toEqual(['ru']);
  });
});

describe('AuthResponseSchema (F31)', () => {
  it('refreshToken опционален (web получает его через cookie)', () => {
    const base = {
      user: {
        id: '5f8d5b1e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
        email: 'user@example.ru',
        xp: 0,
        currentStreak: 0,
      },
      accessToken: 'jwt',
      expiresIn: 3600,
    };
    expect(AuthResponseSchema.parse(base).refreshToken).toBeUndefined();
    expect(AuthResponseSchema.parse({ ...base, refreshToken: 'rt' }).refreshToken).toBe('rt');
  });

  it('отклоняет не-UUID id пользователя', () => {
    const res = AuthResponseSchema.safeParse({
      user: { id: 'not-a-uuid', email: 'a@b.ru', xp: 0, currentStreak: 0 },
      accessToken: 'jwt',
      expiresIn: 3600,
    });
    expect(res.success).toBe(false);
  });
});

describe('LoginSchema / ChangePasswordSchema / ResetPasswordSchema (F31)', () => {
  it('login требует непустой пароль', () => {
    expect(LoginSchema.parse({ email: 'a@b.ru', password: 'x' }).password).toBe('x');
    expect(LoginSchema.safeParse({ email: 'a@b.ru', password: '' }).success).toBe(false);
  });

  it('смена пароля требует различие старого и нового', () => {
    const res = ChangePasswordSchema.safeParse({
      currentPassword: 'same-pass',
      newPassword: 'same-pass',
    });
    expect(res.success).toBe(false);
  });

  it('reset-password: токен обязателен, пароль 8+', () => {
    expect(
      ResetPasswordSchema.parse({ token: 'tok', newPassword: 'new-pass-123' }).newPassword,
    ).toBe('new-pass-123');
    expect(ResetPasswordSchema.safeParse({ token: '', newPassword: 'new-pass-123' }).success).toBe(
      false,
    );
  });
});
