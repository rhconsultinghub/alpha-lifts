import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'

// Service-worker registration with real auto-update. The plugin's default injected registration
// only registered the worker and never reloaded when a new version activated, so an installed PWA
// (especially on Android, which doesn't re-check on background-resume) kept serving the old cached
// bundle until it was reinstalled. registerSW() with registerType 'autoUpdate' reloads the page as
// soon as a new SW takes control; `onRegisteredSW` additionally re-checks for a new SW every time
// the app returns to the foreground — the moment it can pick one up unobtrusively (the user is
// arriving, not mid-set), so a fresh deploy shows up on the next open instead of a reinstall.
registerSW({
  immediate: true,
  onRegisteredSW(_swScriptUrl, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
