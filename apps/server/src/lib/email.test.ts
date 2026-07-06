import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { buildPasswordResetEmail, closeEmailTransporter } from './email.js';
import {
  generateAccessToken,
  generatePasswordResetToken,
  generateRefreshToken,
} from '../modules/auth/auth.service.js';
import { loadConfig } from '../config.js';

describe('generatePasswordResetToken', () => {
  it('returns 64 hex characters (32 bytes -> 64 hex)', () => {
    const token = generatePasswordResetToken();
    expect(typeof token).toBe('string');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generatePasswordResetToken()));
    expect(tokens.size).toBe(50);
  });
});

describe('buildPasswordResetEmail', () => {
  const link = 'https://hanzi.app/reset-password?token=abc123';

  it('contains the reset link in text and html', () => {
    const { text, html, subject } = buildPasswordResetEmail(link);
    expect(subject).toBe('Сброс пароля HanZi');
    expect(text).toContain(link);
    expect(html).toContain(link);
  });

  it('mentions the TTL in human-readable form', () => {
    const { text, html } = buildPasswordResetEmail(link, 15);
    expect(text).toContain('15 минут');
    expect(html).toContain('15 минут');
  });

  it('includes a Russian-language explanation', () => {
    const { text } = buildPasswordResetEmail(link);
    expect(text).toMatch(/сброс/i);
    expect(text).toMatch(/проигнорируйте/i);
  });
});

describe('generateAccessToken — pv claim', () => {
  it('includes userId, email and pv in the signed payload', () => {
    const config = loadConfig();
    const token = generateAccessToken('user-1', 'a@b.c', 7);
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as {
      userId: string;
      email: string;
      pv: number;
    };
    expect(payload.userId).toBe('user-1');
    expect(payload.email).toBe('a@b.c');
    expect(payload.pv).toBe(7);
  });

  it('produces different signatures for different pv values', () => {
    const t1 = generateAccessToken('u', 'a@b.c', 1);
    const t2 = generateAccessToken('u', 'a@b.c', 2);
    expect(t1).not.toBe(t2);
  });
});

describe('generateRefreshToken — unchanged signature', () => {
  it('still signs userId + tokenVersion', () => {
    const config = loadConfig();
    const token = generateRefreshToken('user-1', 3);
    const payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as {
      userId: string;
      tokenVersion: number;
    };
    expect(payload.userId).toBe('user-1');
    expect(payload.tokenVersion).toBe(3);
  });
});

// Закрытие транспорта, если он был инициализирован (в этих тестах
// SMTP_HOST не задан, поэтому transporter == null, но на всякий случай).
void closeEmailTransporter();
