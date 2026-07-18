// Загружаем .env вручную, чтобы тесты, использующие настоящую БД
// (sessions.idor.test.ts, refresh.cas.test.ts, words.admin.test.ts),
// подключались к Postgres из apps/server/.env, а не к фиктивной
// `postgresql://test:test@localhost:5432/test`. Без зависимости на
// dotenv — `import 'dotenv/config'` тянет пакет, который формально
// не заявлен в apps/server/package.json (приходит транзитивно).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '.env');
if (existsSync(envPath)) {
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/i.exec(trimmed);
    if (!m) continue;
    const name = m[1]!;
    const value = m[2]!;
    if (process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}

// Тестовые переменные окружения. Здесь достаточно минимума, чтобы
// `loadConfig()` не падал с "Invalid environment variables".
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-32-chars-min-padding';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-32-chars-padding';
process.env.PORT ??= '3001';
process.env.CORS_ORIGIN ??= 'http://localhost:5173';
// SMTP не обязателен в тестах; если тест вызовет email-функцию,
// он сам должен замокать transport.
process.env.SMTP_FROM ??= 'HanZi Test <test@hanzi.app>';
// Разрешённые TLD email при регистрации (PLAN_Features_v0.3 §3).
// Дефолт совпадает с продакшном (только .ru).
process.env.ALLOWED_EMAIL_TLDS ??= 'ru';
