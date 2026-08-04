import { describe, it, expect } from 'vitest';
import { envSchema, getAllowedOrigins } from './config.js';

// Полный набор переменных из vitest.setup.ts, чтобы safeParse не падал
// на отсутствующих обязательных полях. CORS_ORIGIN переопределяем в каждом тесте.
const baseEnv = { ...process.env };

describe('config CORS_ORIGIN (PLAN_Features_v0.4 §32)', () => {
  it('rejects CORS_ORIGIN="*" — incompatible with credentials: true', () => {
    const result = envSchema.safeParse({ ...baseEnv, CORS_ORIGIN: '*' });
    expect(result.success).toBe(false);
  });

  it('rejects CORS_ORIGIN=" * " (whitespace-padded wildcard)', () => {
    const result = envSchema.safeParse({ ...baseEnv, CORS_ORIGIN: ' * ' });
    expect(result.success).toBe(false);
  });

  it('accepts a single origin', () => {
    const result = envSchema.safeParse({ ...baseEnv, CORS_ORIGIN: 'http://localhost:5173' });
    expect(result.success).toBe(true);
  });

  it('accepts a comma-separated list of origins', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      CORS_ORIGIN: 'http://a.example, http://b.example',
    });
    expect(result.success).toBe(true);
  });

  it('parses allowed origins, trimming and dropping empties', () => {
    const cfg = envSchema.parse({
      ...baseEnv,
      CORS_ORIGIN: ' http://a.example , http://b.example, ',
    });
    expect(getAllowedOrigins(cfg)).toEqual(['http://a.example', 'http://b.example']);
  });
});
