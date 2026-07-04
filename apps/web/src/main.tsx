import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { initDb } from './db/database';
import { initSyncEngine } from './db/sync';
import { bootstrapTheme } from './ui/theme';
import { initAnalytics } from './utils/analytics';
import './styles/global.css';

// Применяем тему до маунта React-дерева, чтобы избежать вспышки
// неправильной палитры при загрузке.
bootstrapTheme();

// Аналитика: подключаем pagehide/beforeunload/visibilitychange.
// Сам `initAnalytics` — no-op, если в окружении нет window (SSR/tests)
// или пользователь отказался от трекинга (DNT, opt-out).
initAnalytics();

initDb()
  .catch((error) => {
    console.error('Failed to initialize local database:', error);
  })
  .finally(() => {
    initSyncEngine();
  });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
