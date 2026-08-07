/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

// __WB_MANIFEST is the precache list vite-plugin-pwa injects at build time.
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// skipWaiting is NO LONGER unconditional: the page decides when a downloaded update may take
// over (main.tsx sends SKIP_WAITING — immediately when idle, deferred while a workout is
// running), because the takeover triggers a page reload and an unconditional one could fire
// mid-set. clientsClaim stays so the new SW controls all tabs the moment it does activate.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Exercise photos are deliberately NOT precached (they were 2.6 MB of atomic install weight —
// see vite.config.ts). CacheFirst: each photo is fetched once, then served from cache forever
// (they're immutable content-by-filename), staying available offline after a first view.
registerRoute(
  ({ url }) => url.pathname.includes('/exercise-photos/'),
  new CacheFirst({
    cacheName: 'exercise-photos',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true })
    ]
  })
);

// The reason this project hand-writes its service worker instead of using generateSW: tapping a
// rest notification should drop the user straight back onto the exercise they're partway through,
// and `notificationclick` can only be handled here.
//
// Both rest notifications are handled: the live countdown ('rest-progress') and the completion
// alert ('rest-complete'). The countdown used to carry no `data` at all and so fell through the
// check below — tapping it did nothing, which is a strange thing for a notification about a
// workout you're in the middle of to do.
//
// The worker deliberately doesn't try to work out *which* exercise that is — only the page knows
// the live workout state (current exercise, which sets are ticked). So when the app is still running
// it just focuses it and posts a message, letting useApp do the navigation; when the app is fully
// closed there's no client to message, so the intent is handed over in the URL hash for the app to
// pick up on boot.
const REST_TYPES = ['rest-complete', 'rest-progress'];

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  if (!REST_TYPES.includes(event.notification.data?.type)) return;
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(c => c.url.startsWith(scope));
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: 'open-rest-exercise' });
      return;
    }
    await self.clients.openWindow(scope + '#rest-exercise');
  })());
});
