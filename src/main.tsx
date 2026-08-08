import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'
import { isNative } from './native/platform.ts'
import { initNativeShell } from './native/lifecycle.ts'

// Service-worker registration with workout-aware auto-update. The plugin's default injected
// registration only registered the worker and never reloaded when a new version activated, so an
// installed PWA (especially on Android, which doesn't re-check on background-resume) kept serving
// the old cached bundle until it was reinstalled. The first fix used registerType 'autoUpdate',
// which reloads the moment a new SW takes control — but "the moment" could be mid-set (e.g.
// returning from a rest notification just as a deploy landed), losing in-flight input. Now the
// update is downloaded eagerly but only APPLIED (SKIP_WAITING → activate → reload) when no
// workout is running; with one running, a 30s poll applies it as soon as the session ends. App
// state survives the reload regardless (persisted + synced) — this is purely about not yanking
// the page out from under someone mid-lift.
//
// None of this runs in the native (Capacitor) shell: there is no service worker there — the
// bundle ships inside the APK and updates come from the store — and initNativeShell() wires the
// native equivalents (back button, notification taps, status bar) instead.
const workoutInProgress = (): boolean => {
  try {
    const raw = localStorage.getItem('fitness-app-state-v1')
    if (!raw) return false
    return (JSON.parse(raw) as { workout?: unknown }).workout != null
  } catch {
    return false
  }
}

if (isNative()) {
  void initNativeShell()
} else {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (!workoutInProgress()) {
        void updateSW(true)
        return
      }
      const poll = window.setInterval(() => {
        if (!workoutInProgress()) {
          window.clearInterval(poll)
          void updateSW(true)
        }
      }, 30_000)
    },
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) return
      // Re-check for a new deploy every time the app returns to the foreground, so updates are
      // found on the next open instead of needing a reinstall. Applying remains gated above.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {})
      })
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
