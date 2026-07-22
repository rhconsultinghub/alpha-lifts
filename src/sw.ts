/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

// __WB_MANIFEST is the precache list vite-plugin-pwa injects at build time.
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Same auto-update behaviour the previously-generated (generateSW) worker had: take over
// immediately rather than sitting in "waiting" behind an already-open tab.
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

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
