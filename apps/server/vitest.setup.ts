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
