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

export function fireReminder(dayLabel: string): void {
  try { new Notification('Time to train', { body: dayLabel + ' is on today’s plan.', icon: 'icon-192.png' }); } catch { /* unsupported or blocked */ }
}
