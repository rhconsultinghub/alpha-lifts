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

// The reason this project hand-writes its service worker instead of using generateSW: tapping the
// "Rest complete" notification should drop the user straight back onto the exercise they're partway
// through, and `notificationclick` can only be handled here.
//
// The worker deliberately doesn't try to work out *which* exercise that is — only the page knows
// the live workout state (current exercise, which sets are ticked). So when the app is still running
// it just focuses it and posts a message, letting useApp do the navigation; when the app is fully
// closed there's no client to message, so the intent is handed over in the URL hash for the app to
// pick up on boot.
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  if (event.notification.data?.type !== 'rest-complete') return;
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
