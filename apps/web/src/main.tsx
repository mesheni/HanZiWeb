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

// Degraded-режим раньше был тихим: пользователь не понимал, почему
// прогресс не сохраняется. Показываем заметный баннер с причиной.
function showStorageWarning(): void {
  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:9999;padding:8px 16px;' +
    'background:#b91c1c;color:#fff;font:14px/1.4 system-ui,sans-serif;text-align:center;';
  banner.textContent =
    'Локальное хранилище недоступно — прогресс не сохраняется на устройстве. ' +
    'Закройте другие вкладки приложения и обновите страницу.';
  document.body.appendChild(banner);
}

async function bootstrap(): Promise<void> {
  try {
    await initDb();
  } catch (error) {
    // Storage недоступен (private mode / quota / блокировка другой
    // вкладкой) — приложение работает в degraded-режиме: без локального
    // зеркала и offline-очереди. React всё равно монтируется, чтобы не
    // оставлять пользователя на сплэше навсегда.
    console.error('Failed to initialize local database:', error);
    showStorageWarning();
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
