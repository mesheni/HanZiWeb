import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// F30: явный тестовый конфиг. Раньше vitest молча использовал дефолты
// (без vite.config.ts тесты жили только на utility-модулях). Теперь:
// jsdom-окружение (DOM-тесты), setup с fake-indexeddb (RxDB-тесты),
// alias `@/*` как в приложении.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
