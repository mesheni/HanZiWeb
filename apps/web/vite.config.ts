import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // F23: `json` в globPatterns тащил в precache ВСЕ 9.5k файлов
        // public/hanzi-writer-data (~32 MiB). Данные иероглифов
        // кэшируются runtime (CacheFirst в sw.ts) при первом
        // использовании — в манифест они не нужны.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['hanzi-writer-data/**'],
      },
      manifest: {
        name: 'HanZi — Китайские слова',
        short_name: 'HanZi',
        description: 'Приложение для заучивания китайских слов с интервальным повторением',
        theme_color: '#0C0E16',
        background_color: '#0C0E16',
        display: 'standalone',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // F23: 766 kB main chunk — ручной vendor-split: реакт-стек,
        // rxdb и UI-библиотеки в отдельные chunk'и, которые грузятся
        // параллельно и кэшируются независимо.
        manualChunks: {
          'react-vendor': [
            'react',
            'react-dom',
            'react-router-dom',
            'zustand',
            '@tanstack/react-query',
          ],
          rxdb: ['rxdb', 'rxjs'],
          ui: ['lucide-react', 'canvas-confetti', 'hanzi-writer'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
