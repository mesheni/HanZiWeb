import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { initDb } from './db/database';
import { initSyncEngine } from './db/sync';
import { queryClient } from './api/queryClient';
import { bootstrapTheme } from './ui/theme';
import { initAnalytics } from './utils/analytics';
import './styles/global.css';

// F19: React-дерево монтируется только после готовности локального
// storage (initDb). Иначе экраны стартуют раньше RxDB, ответы в это
// окно теряются (getDb() === null), а sync-очередь стартует на
// неинициализированной базе. Пока БД открывается — статичный сплэш.
function BootScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-screen-spinner" />
    </div>
  );
}

const rootElement = document.getElementById('root')!;
const root = ReactDOM.createRoot(rootElement);

// Применяем тему до маунта React-дерева, чтобы избежать вспышки
// неправильной палитры при загрузке.
bootstrapTheme();

root.render(<BootScreen />);

// Аналитика: подключаем pagehide/beforeunload/visibilitychange.
// Сам `initAnalytics` — no-op, если в окружении нет window (SSR/tests)
// или пользователь отказался от трекинга (DNT, opt-out).
initAnalytics();

async function bootstrap(): Promise<void> {
  try {
    await initDb();
  } catch (error) {
    // Storage недоступен (private mode / quota) — приложение работает
    // в degraded-режиме: без локального зеркала и offline-очереди.
    // React всё равно монтируется, чтобы не оставлять пользователя
    // на сплэше навсегда.
    console.error('Failed to initialize local database:', error);
  }

  // initSyncEngine() зависит от initDb: стартуем только после того,
  // как dbInstance установлен (flush читает pending_changes).
  initSyncEngine();

  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
