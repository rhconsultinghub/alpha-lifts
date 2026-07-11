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
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
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
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,jpg}']
      }
    })
  ],
}))
