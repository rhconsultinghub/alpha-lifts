import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://<user>.github.io/alpha-lifts/ in production (GitHub Pages project site),
// so the build needs that subpath as its base; local dev stays at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/alpha-lifts/' : '/',
  plugins: [
    react(),
    VitePWA({
      // injectManifest (rather than the simpler generateSW) specifically so the app can ship its own
      // `notificationclick` handler — see src/sw.ts. That event can only be handled inside the
      // service worker, and generateSW offers no hook to add custom event listeners.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // 'prompt' (not 'autoUpdate'): main.tsx decides WHEN a downloaded update applies. autoUpdate
      // force-reloaded the page the instant a new SW took control — including mid-workout, e.g.
      // returning from a rest notification right as a deploy landed, losing in-flight input. Now
      // updates apply immediately when idle but wait out an active workout. See main.tsx + sw.ts.
      registerType: 'prompt',
      // Register the SW ourselves in main.tsx (via virtual:pwa-register) instead of the plugin's
      // auto-injected script. The injected one only *registered* the worker and never reloaded the
      // page when a new version activated, so an installed PWA kept serving the old cached bundle
      // until it was reinstalled. The manual registerSW() reloads on new-SW takeover
      // and lets us add a foreground update check. See main.tsx.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        // Explicit stable identity: without `id` Chromium derives app identity from start_url,
        // so changing `base`/start_url later would orphan existing installs.
        id: '/alpha-lifts/',
        name: 'Alpha Lifts',
        short_name: 'Alpha Lifts',
        description: 'Mobile fitness progress tracker — plan workouts, log sets, and track muscle-group volume over time.',
        theme_color: '#0d0c0b',
        background_color: '#0d0c0b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/alpha-lifts/',
        scope: '/alpha-lifts/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      injectManifest: {
        // No `jpg` here anymore: the 151 exercise photos were ~2.6 MB of a ~3.7 MB precache, all
        // downloaded atomically on every install AND revalidated on every deploy — and Workbox
        // precache is all-or-nothing, so one failed photo failed the whole SW install. They now
        // cache on demand via a CacheFirst runtime route in sw.ts (a photo you've viewed once is
        // still available offline; unvisited ones need one online view first). The pngs stay:
        // body-diagram art + muscle masks + icons are core UI, ~350 KB total.
        // woff2: the two self-hosted font files (~70 KB) — they must work offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      }
    })
  ],
}))
