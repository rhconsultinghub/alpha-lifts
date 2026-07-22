// Rest-timer alerts. All feature-detected and no-op silently where unsupported (e.g. a browser
// blocking AudioContext before any user gesture has occurred in the current page lifecycle — a
// workout is always started by a tap, so in practice the rest timer only ever fires after the
// page already has gesture-unlocked audio).

const ICON = () => `${import.meta.env.BASE_URL}icon-192.png`;
// The small monochrome glyph Android draws in the status bar and beside the app name. Without it
// the platform substitutes a generic bell, which is what these notifications used to show — the
// large `icon` above is the app icon and only appears once the shade is pulled down, so the bell
// was the *only* thing visible most of the time. badge-96.png is a solid-white barbell on
// transparency (regenerate with scripts/make-badge.mjs): Android uses the alpha channel
// only and tints the result, so any interior shading would flatten into a blob.
const BADGE = () => `${import.meta.env.BASE_URL}badge-96.png`;
// Two separate tags on purpose. The countdown ticker replaces itself in place every tick with
// `silent: true`; if the final "Rest complete" alert reused that same tag it would be delivered as
// an *update* to an existing, already-silenced notification, and Android generally won't re-alert
// (no sound, no vibration) for an in-place replacement — `renotify` is inconsistently honoured. By
// closing the ticker and posting the completion under its own fresh tag, the OS treats it as a new
// notification and applies the normal notification alert behaviour, which is what actually drives
// the vibration on Android. (See notifyRestEnd for the rest of the vibration story.)
const TAG_PROGRESS = 'alpha-lifts-rest-progress';
const TAG_DONE = 'alpha-lifts-rest-done';

// Long, clearly-patterned buzz — the old [200,100,200] was easy to miss against a rack or through a
// pocket, and the whole point of this alert is to be felt without looking.
const REST_END_PATTERN = [400, 150, 400, 150, 600];

// What the tray is told about the session in progress. Assembled by the caller (useApp's restTick)
// because only the page knows the live workout — this module deliberately holds no state and does
// no lookups, matching how the service worker stays out of the "which exercise?" question too.
export interface RestContext {
  exerciseName: string;
  /** "Set 3 of 4" — already resolved, since set indexing lives in the workout state. */
  setLabel: string;
  /** "100 lb × 5", or '' for a lift with no target to show. */
  targetText: string;
  dayLabel: string;
}

// Motivational close-out, in the voice the user already picked for in-app coaching copy (Settings →
// Coach Voice) rather than a fourth tone invented for the tray. Notification titles get truncated
// hard on a phone — roughly 40 characters before the ellipsis on Android — so every line here is
// written to survive that, with the workout detail carried in the body where there's more room.
const REST_END_LINES: Record<string, string[]> = {
  Direct: ['Rest is over.', 'Back to the bar.', 'Next set is up.', 'Time to work.'],
  Encouraging: ['You’re recovered — go again.', 'Bar’s waiting for you.', 'Nice rest. Next set!', 'Ready when you are.'],
  Hype: ['LET’S GO! 🔥', 'Bar’s waiting. 💪', 'Time to move some weight! ⚡', 'Go get that set! 🚀']
};

// Deliberately random per fire rather than cycling an index: the alternative needs persisted state
// for something that genuinely doesn't matter, and a repeat now and then is unnoticeable.
function restEndLine(voice: string): string {
  const lines = REST_END_LINES[voice] || REST_END_LINES.Encouraging;
  return lines[Math.floor(Math.random() * lines.length)];
}

// Body copy shared by both notifications. Joined from the parts that actually have content, so a
// bodyweight lift with no target doesn't produce a dangling separator. `withName` is false for the
// countdown, whose title already carries the exercise name — repeating it there costs one of the
// two body lines a phone will show, to say something already on screen.
function contextBody(ctx: RestContext | undefined, suffix: string, withName: boolean): string {
  if (!ctx) return suffix;
  const parts = [withName ? ctx.exerciseName : '', ctx.setLabel, ctx.targetText, ctx.dayLabel].filter(Boolean);
  return parts.join(' · ') + (suffix ? '\n' + suffix : '');
}

// Returns whether the browser *accepted* the call. Chrome returns false when it refuses to vibrate
// (most commonly because the frame has no user activation yet); it returns true once the request is
// handed to the OS, which is not the same as the phone actually buzzing — see testVibration().
export function vibrateRestEnd(): boolean {
  try { return typeof navigator.vibrate === 'function' ? navigator.vibrate(REST_END_PATTERN) : false; }
  catch { return false; }
}

// Fired straight from a tap in Settings, so user activation is guaranteed. That's what makes it a
// useful diagnostic: it splits the two failure modes apart, which need completely different fixes.
//   - returns false  -> the browser refused the call outright (Vibration API blocked/absent).
//   - returns true but nothing is felt -> the call reached the OS and Android suppressed it, i.e.
//     device-level haptics: Do Not Disturb, "Vibration & haptics" turned down/off, a per-app or
//     per-site block, or an OEM battery-saver profile. Nothing the page can override.
export function testVibration(): boolean {
  try { return typeof navigator.vibrate === 'function' ? navigator.vibrate(REST_END_PATTERN) : false; }
  catch { return false; }
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
export async function notifyRestEnd(vibrate: boolean, ctx?: RestContext, voice = 'Encouraging'): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    // `vibrate` and `renotify` are spec options missing from this project's TS DOM lib typings,
    // hence the cast. Note `vibrate` is effectively dead on modern Chrome (the Notification
    // vibration option was removed) — it's kept for browsers that still honour it, but the vibration
    // that actually reaches a backgrounded phone comes from the OS alerting on a *new* notification,
    // which is why this posts under its own tag after clearing the silent ticker. Foreground
    // vibration is handled separately by vibrateRestEnd()'s navigator.vibrate() call, since the
    // Vibration API is restricted to visible documents.
    // data.type is what the service worker's notificationclick handler keys off to reopen the app
    // on the right exercise (see src/sw.ts).
    // The motivational line is the *title* rather than the body: on a locked phone the title is
    // frequently all that renders, so burying the "get back to it" in the body would mean the one
    // thing this alert exists to say is the part most likely to be cut off.
    const title = restEndLine(voice);
    const options = {
      body: contextBody(ctx, 'Tap to jump back in.', true), icon: ICON(), badge: BADGE(),
      tag: TAG_DONE, renotify: true,
      data: { type: 'rest-complete' },
      ...(vibrate ? { vibrate: [200, 100, 200] } : {})
    } as NotificationOptions;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      // clear the silent countdown first so the completion lands as a brand-new notification
      const stale = await reg.getNotifications({ tag: TAG_PROGRESS });
      stale.forEach(n => n.close());
      await reg.showNotification(title, options);
      return;
    }
    new Notification(title, options);
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
export async function updateRestProgressNotification(remainingSec: number, ctx?: RestContext): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const mm = Math.floor(remainingSec / 60);
    const ss = String(remainingSec % 60).padStart(2, '0');
    // Clock first in the title — it's the one thing being glanced at, and it stays readable even
    // when the exercise name after it gets truncated. `data` matters as much as the copy here: it's
    // what makes tapping the *countdown* return to the workout, which it previously didn't (the
    // service worker's handler bails on any notification without a recognised type, and this one
    // used to carry none — so a tap did nothing at all until the timer finished).
    await reg.showNotification(`${mm}:${ss} rest · ${ctx ? ctx.exerciseName : 'Resting'}`, {
      body: contextBody(ctx, 'Tap to return to your workout.', false),
      icon: ICON(), badge: BADGE(), tag: TAG_PROGRESS, silent: true,
      data: { type: 'rest-progress' }
    } as NotificationOptions);
  } catch { /* unsupported or blocked */ }
}

// Clears any lingering countdown notification (rest skipped/adjusted away/exercise switched
// without resting) so a stale "Resting… 0:12 remaining" doesn't sit in the tray forever.
export async function clearRestProgressNotification(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    for (const tag of [TAG_PROGRESS, TAG_DONE]) {
      const notifs = await reg.getNotifications({ tag });
      notifs.forEach(n => n.close());
    }
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
