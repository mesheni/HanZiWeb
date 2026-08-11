import { defineConfig } from 'vitest/config';

// F31: тестовая инфраструктура shared — схемы больше не проверяются
// только typecheck'ом. Node-окружение (пакет без DOM/RN-кода).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
