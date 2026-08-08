/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL, type PrecacheEntry } from 'workbox-precaching';
import { registerRoute, Route } from 'workbox-routing';
import { NetworkFirst, NetworkOnly, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

declare global {
  interface ServiceWorkerGlobalScope {
    __WB_MANIFEST: (string | PrecacheEntry)[];
  }
}

precacheAndRoute(self.__WB_MANIFEST);

// F23: autoUpdate (registerType: 'autoUpdate') шлёт 'SKIP_WAITING' новому
// SW после его установки — без этого обновления ждут закрытия вкладки.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const API_CACHE = 'api-cache';

// Кэшируем только публичный словарь и только анонимные запросы:
// ответы /api/words* для залогиненных (Authorization: Bearer) содержат
// userProgress — они обязаны идти мимо кэша (PLAN_Features_v0.4 §6).
registerRoute(
  ({ url, request }) =>
    (url.pathname === '/api/words' || url.pathname.startsWith('/api/words/')) &&
    !request.headers.has('authorization'),
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 })],
  }),
);

// Приватные эндпоинты — всегда сеть, ответы не оседают в кэше SW.
const PRIVATE_API =
  /^\/api\/(auth|stats|sessions|tests|sync|decks|users|tags|achievements|reading|devices)(\/|$)/;
registerRoute(({ url }) => PRIVATE_API.test(url.pathname), new NetworkOnly());

// При смене версии SW сносим унаследованный api-cache — в старых версиях
// туда могли попасть приватные ответы.
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(caches.delete(API_CACHE));
});

// F23: данные иероглифов (hanzi-writer-data) исключены из precache
// (9.5k файлов ~32 MiB) — кэшируются runtime при первом использовании,
// дальше работают офлайн.
registerRoute(
  /\/hanzi-writer-data\/.*/i,
  new CacheFirst({
    cacheName: 'hanzi-writer-data-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 31536000 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

registerRoute(
  /\/audio\/.*/i,
  new CacheFirst({
    cacheName: 'audio-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 31536000 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// F23: navigation fallback — офлайн-переходы (включая глубокие ссылки
// и PWA-установку) отдают precached index.html вместо сетевой ошибки.
// NetworkFirst: при наличии сети html обновляется, при отсутствии —
// fallback на прекэшированный.
registerRoute(
  new Route(
    ({ request, url }) =>
      request.mode === 'navigate' &&
      !PRIVATE_API.test(url.pathname) &&
      !/\/hanzi-writer-data\//.test(url.pathname),
    async (args) => {
      try {
        const networkFirst = new NetworkFirst({ cacheName: 'pages', networkTimeoutSeconds: 3 });
        return await networkFirst.handle(args);
      } catch {
        return createHandlerBoundToURL('/index.html')(args);
      }
    },
  ),
);

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let data: { title?: string; body?: string; icon?: string; badge?: string; url?: string };
  try {
    data = event.data.json();
  } catch {
    data = { title: 'HanZi', body: event.data.text() };
  }

  const title = data.title ?? 'HanZi';
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: data.icon ?? '/icon-192.png',
    badge: data.badge ?? '/icon-192.png',
    data: { url: data.url ?? '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) {
          return (client as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
