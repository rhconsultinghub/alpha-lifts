/**
 * Local notifications for the native shell. Web is a NO-OP throughout — the web app keeps its
 * existing service-worker notification path in src/state/alerts.ts untouched.
 *
 * The native model is deliberately better than the web one: instead of a JS tick firing a
 * notification when the timer happens to run (which dies with a suspended WebView), the rest-end
 * notification is SCHEDULED at restEndAt the moment rest starts, and cancelled/rescheduled when
 * the rest is skipped or adjusted. The OS delivers it on time regardless of app state. The same
 * applies to the daily reminder: a repeating scheduled notification replaces the web's
 * 60-second-interval check.
 *
 * Exact-alarm note: we deliberately do NOT request the Play-restricted USE_EXACT_ALARM
 * permission. allowWhileIdle scheduling can drift a little under Doze; measure on a real device
 * before adding the changeExactNotificationSetting() opt-in flow.
 */
import { isNative } from './platform';
import { restEndLine, contextBody, type RestContext } from '../state/alerts';

const REST_END_ID = 1001;
const DAILY_REMINDER_ID = 2001;
const CHANNEL_REST = 'rest-timers';
const CHANNEL_REMINDERS = 'reminders';

async function plugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

let channelsReady = false;
async function ensureChannels(): Promise<void> {
  if (channelsReady) return;
  const ln = await plugin();
  // Android-only concept; createChannel is a no-op elsewhere. High importance = heads-up +
  // vibration, matching what the web notification path fights so hard to achieve.
  await ln.createChannel({ id: CHANNEL_REST, name: 'Rest timers', importance: 5, vibration: true });
  await ln.createChannel({ id: CHANNEL_REMINDERS, name: 'Workout reminders', importance: 4, vibration: true });
  channelsReady = true;
}

/** Ask for notification permission (Android 13+ POST_NOTIFICATIONS dialog). Call at the same
 *  contextual moment the web asks — first rest start with alerts on, or reminders toggled on. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const ln = await plugin();
    const status = await ln.checkPermissions();
    if (status.display === 'granted') return true;
    const req = await ln.requestPermissions();
    return req.display === 'granted';
  } catch {
    return false;
  }
}

/** Schedule the rest-complete notification for the absolute restEndAt. Replaces any previous
 *  one (fixed id), so adjust = just call again with the new time. */
export async function scheduleRestEndNotification(restEndAt: number, ctx: RestContext | undefined, voice: string): Promise<void> {
  if (!isNative()) return;
  try {
    if (!(await ensureNotificationPermission())) return;
    await ensureChannels();
    const ln = await plugin();
    await ln.cancel({ notifications: [{ id: REST_END_ID }] });
    if (restEndAt <= Date.now()) return;
    const callToAction = ctx?.firstName ? `${ctx.firstName}, tap to jump back in.` : 'Tap to jump back in.';
    await ln.schedule({
      notifications: [{
        id: REST_END_ID,
        title: restEndLine(voice),
        body: contextBody(ctx, callToAction, true),
        channelId: CHANNEL_REST,
        schedule: { at: new Date(restEndAt), allowWhileIdle: true },
        smallIcon: 'ic_stat_notify',
        // Consumed by the tap listener in lifecycle.ts, which routes through the same
        // #rest-exercise hash path the web service worker uses.
        extra: { type: 'rest-complete' }
      }]
    });
  } catch { /* plugin unavailable — in-app RestToast still covers the foreground */ }
}

export async function cancelRestEndNotification(): Promise<void> {
  if (!isNative()) return;
  try {
    const ln = await plugin();
    await ln.cancel({ notifications: [{ id: REST_END_ID }] });
  } catch { /* nothing to cancel */ }
}

/** Repeating daily reminder at HH:MM. Idempotent — cancel-then-schedule, so call freely on
 *  toggle, time change, and app launch. Copy is day-agnostic for M1: a scheduled notification
 *  can't know whether a session is still owed (M2's server push restores that smartness). */
export async function scheduleDailyReminder(timeHHMM: string, firstName?: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    if (!(await ensureNotificationPermission())) return false;
    await ensureChannels();
    const ln = await plugin();
    await ln.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
    const [hour, minute] = timeHHMM.split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
    await ln.schedule({
      notifications: [{
        id: DAILY_REMINDER_ID,
        title: 'Time to train 🏋️',
        body: firstName ? `${firstName}, check today’s plan and get it logged.` : 'Check today’s plan and get it logged.',
        channelId: CHANNEL_REMINDERS,
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        smallIcon: 'ic_stat_notify',
        extra: { type: 'daily-reminder' }
      }]
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelDailyReminder(): Promise<void> {
  if (!isNative()) return;
  try {
    const ln = await plugin();
    await ln.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
  } catch { /* nothing to cancel */ }
}
