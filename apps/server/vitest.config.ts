import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    // БД-тесты (decks.idor, refresh.cas, sessions.*, stats.*, words.admin)
    // работают с одной реальной Postgres из apps/server/.env. Параллельный
    // запуск файлов ведёт к гонкам на общих таблицах и флакает тесты
    // (PLAN_Features_v0.4 §29). Запускаем файлы последовательно: внутри
    // файла данные изолированы уникальными email/char (testRunId), а
    // afterAll удаляет пользователя — каскадные onDelete: Cascade в
    // schema.prisma вычищают все зависимые строки.
    fileParallelism: false,
  },
});
