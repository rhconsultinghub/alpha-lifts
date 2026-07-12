// Rest-timer completion alerts. Both are feature-detected and no-op silently where unsupported
// (e.g. navigator.vibrate on iOS Safari, or a browser blocking AudioContext before any user
// gesture has occurred in the current page lifecycle) — a workout is always started by a tap, so
// in practice the rest timer only ever fires after the page already has gesture-unlocked audio.

export function vibrateRestEnd(): void {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported */ }
}

// The one alert of the three that can actually reach the user while the app is backgrounded (not
// fully closed) — vibrate is spec-restricted to visible documents and WebAudio gets suspended in
// background tabs on most browsers, so neither can fire at all once the app loses focus. A
// Notification still needs its triggering JS to run, so this isn't a guarantee once the OS fully
// suspends a minimized PWA (see reminders.ts for the same underlying limitation), but it covers the
// common case of switching to another app briefly during a rest period.
export function notifyRestEnd(): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification('Rest complete', { body: 'Time to get back to it.', icon: 'icon-192.png', tag: 'alpha-lifts-rest' });
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
