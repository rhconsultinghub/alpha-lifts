// Rest-timer alerts. All feature-detected and no-op silently where unsupported (e.g. a browser
// blocking AudioContext before any user gesture has occurred in the current page lifecycle — a
// workout is always started by a tap, so in practice the rest timer only ever fires after the
// page already has gesture-unlocked audio).

const ICON = () => `${import.meta.env.BASE_URL}icon-192.png`;
const TAG = 'alpha-lifts-rest';

export function vibrateRestEnd(): void {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported */ }
}

// Rest-complete alert. Routed through the active Service Worker's showNotification() rather than
// the page-context `new Notification()` constructor, and — critically — carries its vibrate
// pattern as part of the notification options rather than a separate navigator.vibrate() call.
// That distinction is what makes this reach the user while the PWA is minimized: the Vibration
// API spec restricts navigator.vibrate() to visible documents (a backgrounded/minimized page's
// calls are silently dropped), but a vibrate pattern attached to a Notification is driven by the
// OS notification system instead, which isn't subject to that restriction. Falls back to the
// plain constructor if no Service Worker is available (e.g. mid-development without the PWA
// plugin's registration active) — vibration won't reach a backgrounded page in that fallback, but
// the toast still will.
export async function notifyRestEnd(vibrate: boolean): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    // `renotify` is part of the spec (and needed here so the completion alert re-alerts even
    // though it reuses the countdown ticker's tag) but missing from this project's TS DOM lib
    // typings, hence the cast.
    const options = {
      body: 'Time to get back to it.', icon: ICON(), tag: TAG, renotify: true,
      ...(vibrate ? { vibrate: [200, 100, 200] } : {})
    } as NotificationOptions;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Rest complete', options);
      return;
    }
    new Notification('Rest complete', options);
  } catch { /* unsupported or blocked */ }
}

// Best-effort live countdown while resting, surfaced as a system notification so it's visible
// even when the app is backgrounded (the in-app rest toast covers the foreground case with a true
// every-second update — see RestToast.tsx). This only updates whenever the caller's tick actually
// runs, which for a backgrounded tab can be throttled by the browser to well under once/sec, so
// "real time" here means "as fresh as the last tick that got to execute," not a guaranteed 1Hz
// clock — the same best-effort ceiling documented for reminders.ts. Reuses the same tag as
// notifyRestEnd so the final "Rest complete" alert cleanly replaces the last countdown update
// rather than stacking a second notification.
export async function updateRestProgressNotification(remainingSec: number): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const mm = Math.floor(remainingSec / 60);
    const ss = String(remainingSec % 60).padStart(2, '0');
    await reg.showNotification('Resting…', { body: `${mm}:${ss} remaining`, icon: ICON(), tag: TAG, silent: true });
  } catch { /* unsupported or blocked */ }
}

// Clears any lingering countdown notification (rest skipped/adjusted away/exercise switched
// without resting) so a stale "Resting… 0:12 remaining" doesn't sit in the tray forever.
export async function clearRestProgressNotification(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const notifs = await reg.getNotifications({ tag: TAG });
    notifs.forEach(n => n.close());
  } catch { /* unsupported or blocked */ }
}

let sharedAudioCtx: AudioContext | null = null;

export function playRestEndSound(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    const ctx = sharedAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    [0, 0.18].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.16);
    });
  } catch { /* unsupported or blocked */ }
}
