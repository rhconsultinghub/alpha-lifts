import type { AppState } from '../data/types';

// Best-effort only: with no backend push service, this can only fire while the PWA is open
// (foreground or a live backgrounded tab) — it will not fire if the app has been fully closed all
// day. That limitation is stated directly in Settings, not just here.
export function shouldFireReminder(state: AppState, now: Date): boolean {
  if (!state.remindersEnabled) return false;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const todayKey = now.toDateString();
  if (state.lastReminderFiredDate === todayKey) return false;
  const [h, m] = state.reminderTime.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)) return false;
  const dow = now.toLocaleDateString(undefined, { weekday: 'long' });
  const todayProgDay = state.dayOrder.map(k => state.program[k]).find(d => d && d.dow === dow);
  if (!todayProgDay || (todayProgDay.kind || 'training') === 'rest') return false;
  if (todayProgDay.skipped) return false;
  if (todayProgDay.lastCompletedAt && new Date(todayProgDay.lastCompletedAt).getTime() >= new Date(state.weekStartedAt).getTime()) return false;
  return true;
}

// Carries the same barbell badge as the rest alerts (see alerts.ts) so every notification this app
// posts wears the same status-bar glyph rather than this one alone falling back to a generic bell.
// Both paths are also BASE_URL-relative now — the bare 'icon-192.png' here resolved against the
// page URL, which is wrong under the '/alpha-lifts/' production base whenever the app isn't sitting
// at the scope root.
// `firstName` is optional throughout — plenty of accounts have no stored name (see AppState.userName)
// and a reminder reading "undefined, Push Day is on today's plan." would be worse than the plain one.
export function fireReminder(dayLabel: string, firstName?: string): void {
  try {
    new Notification('Time to train', {
      body: firstName ? `${firstName}, ${dayLabel} is on today’s plan.` : dayLabel + ' is on today’s plan.',
      icon: `${import.meta.env.BASE_URL}icon-192.png`,
      badge: `${import.meta.env.BASE_URL}badge-96.png`
    });
  } catch { /* unsupported or blocked */ }
}
