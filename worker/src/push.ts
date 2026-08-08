/**
 * Web Push workout reminders — the one reminder channel that works when the app is fully closed.
 * The client's local reminder loop (src/state/reminders.ts) honestly documents that it can only
 * fire while the app is alive; this module is the server half that removes that ceiling.
 *
 * Scope: daily workout reminders only. Rest-timer completion stays client-side — a cron-driven
 * Worker can't schedule a push with 30-300s granularity, and the page/SW path already covers it.
 *
 * Pushes are sent WITHOUT a payload, deliberately: an empty push needs only the VAPID JWT
 * (ES256, WebCrypto — no dependencies), not the RFC 8291 aes128gcm payload encryption. The
 * service worker composes the notification text locally on the `push` event. The subscription's
 * p256dh/auth keys are stored anyway so payload support can be added later without re-subscribing
 * every device.
 *
 * Reminder decision, evaluated per subscription on a cron sweep (see `sweepPushReminders`):
 *  - the user's LOCAL time (IANA zone captured at subscribe; survives DST, unlike a UTC offset)
 *    is past their reminder time but within the catch-up window,
 *  - no reminder was already sent today (last_sent_date, user-local),
 *  - their synced state says today is actually a training day still owed a session — same rule
 *    as the client's shouldFireReminder: weekday matches a non-rest, non-skipped program day not
 *    completed today. No synced state (local-only user) → benefit of the doubt, remind anyway.
 */

import type { Env } from './index';
import { json } from './http';
import { getState } from './db';

// How long past the reminder time the sweep will still fire, so one missed cron tick doesn't
// silently skip the day — but a Worker outage doesn't deliver "evening" reminders at 3am either.
const CATCH_UP_MINUTES = 60;
/** Ceiling per sweep — at personal-app scale this is effectively "all of them". */
const MAX_SUBSCRIPTIONS_PER_SWEEP = 500;

export interface PushSubscriptionRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  reminder_time: string; // 'HH:MM', user-local
  tz: string;            // IANA zone, e.g. 'America/Chicago'
  last_sent_date: string | null; // user-local YYYY-MM-DD
  created_at: number;
}

export function pushConfigured(env: Env): boolean {
  return !!(env.DB && env.VAPID_PRIVATE_JWK && env.VAPID_PUBLIC_KEY);
}

// --- routes ---------------------------------------------------------------------------------

/** GET /push/config — the VAPID public key (public by definition) + whether push is available. */
export function handlePushConfig(env: Env, cors: Record<string, string>): Response {
  return json({ enabled: pushConfigured(env), vapidPublicKey: env.VAPID_PUBLIC_KEY || null }, 200, cors);
}

interface SubscribeBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  reminderTime?: unknown;
  tz?: unknown;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** POST /push/subscribe (authed) — upsert this device's subscription. Re-posted whenever the
 *  reminder time changes, so the endpoint is the natural key and the newest values win. */
export async function handlePushSubscribe(userId: string, body: SubscribeBody, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!pushConfigured(env)) return json({ error: 'push_not_configured' }, 503, cors);
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : '';
  const reminderTime = typeof body.reminderTime === 'string' && HHMM.test(body.reminderTime) ? body.reminderTime : '18:00';
  const tz = typeof body.tz === 'string' && isValidTimeZone(body.tz) ? body.tz : 'UTC';
  if (!endpoint.startsWith('https://') || endpoint.length > 1024 || !p256dh || !auth) {
    return json({ error: 'invalid_subscription' }, 400, cors);
  }
  await env.DB!.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, reminder_time, tz, last_sent_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
       auth = excluded.auth, reminder_time = excluded.reminder_time, tz = excluded.tz`
  ).bind(endpoint, userId, p256dh, auth, reminderTime, tz, Date.now()).run();
  return json({ ok: true }, 200, cors);
}

/** POST /push/unsubscribe (authed) — forget this device. Scoped to the caller's own rows. */
export async function handlePushUnsubscribe(userId: string, body: { endpoint?: unknown }, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.DB) return json({ error: 'push_not_configured' }, 503, cors);
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  if (endpoint) {
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(endpoint, userId).run();
  }
  return json({ ok: true }, 200, cors);
}

// --- local-time helpers ---------------------------------------------------------------------

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface LocalNow {
  date: string;    // YYYY-MM-DD
  minutes: number; // minutes since local midnight
  weekday: string; // 'Monday'..'Sunday' — matches the app's WEEKDAYS values
}

export function localNowIn(tz: string, now = new Date()): LocalNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, weekday: 'long',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  // hour12:false can yield "24" at midnight in some engines.
  const hour = Number(get('hour')) % 24;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + Number(get('minute')),
    weekday: get('weekday')
  };
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// --- "is a session actually owed today?" — mirror of the client's shouldFireReminder ---------

interface StateShape {
  dayOrder?: string[];
  program?: Record<string, { dow?: string; kind?: string; skipped?: boolean; lastCompletedAt?: string | null }>;
}

/** True when the state says today's weekday maps to a training day that hasn't been completed
 *  today and isn't skipped. Unparseable/absent state returns true — a reminder the user asked
 *  for shouldn't silently stop because their blob is odd. */
export function sessionOwedToday(stateJson: string | null, local: LocalNowWithTz): boolean {
  if (!stateJson) return true;
  let state: StateShape;
  try {
    state = JSON.parse(stateJson) as StateShape;
  } catch {
    return true;
  }
  const order = Array.isArray(state.dayOrder) ? state.dayOrder : [];
  const program = state.program || {};
  if (!order.length) return true;
  const day = order.map(k => program[k]).find(d => d && d.dow === local.weekday);
  if (!day) return false;                                  // today is not in the program at all
  if ((day.kind || 'training') === 'rest') return false;   // rest day
  if (day.skipped) return false;                           // explicitly skipped this week
  // Completed-today check in the USER's zone, not UTC.
  if (day.lastCompletedAt) {
    const t = new Date(day.lastCompletedAt).getTime();
    if (Number.isFinite(t) && local.tzDate && local.tzDate(t) === local.date) return false;
  }
  return true;
}

// --- VAPID (RFC 8292) — ES256 JWT via WebCrypto, no dependencies ----------------------------

function b64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let vapidKeyPromise: Promise<CryptoKey> | null = null;
function vapidKey(env: Env): Promise<CryptoKey> {
  if (!vapidKeyPromise) {
    const jwk = JSON.parse(env.VAPID_PRIVATE_JWK!) as JsonWebKey;
    vapidKeyPromise = crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }
  return vapidKeyPromise;
}

async function vapidAuthHeader(endpoint: string, env: Env): Promise<string> {
  const aud = new URL(endpoint).origin;
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(enc.encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'mailto:ryanhouse19@gmail.com'
  })));
  const signingInput = `${header}.${payload}`;
  // WebCrypto ECDSA returns the raw 64-byte r||s form — exactly what JWS ES256 wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), enc.encode(signingInput));
  return `vapid t=${signingInput}.${b64url(new Uint8Array(sig))}, k=${env.VAPID_PUBLIC_KEY}`;
}

/** Send one empty push. Returns 'gone' when the endpoint is dead and should be deleted. */
async function sendEmptyPush(endpoint: string, env: Env): Promise<'ok' | 'gone' | 'error'> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthHeader(endpoint, env),
        TTL: '3600',
        Urgency: 'normal'
      }
    });
  } catch {
    return 'error';
  }
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok || res.status === 201 ? 'ok' : 'error';
}

// --- the cron sweep -------------------------------------------------------------------------

export async function sweepPushReminders(env: Env): Promise<void> {
  if (!pushConfigured(env)) return;
  const db = env.DB!;
  const { results } = await db.prepare('SELECT * FROM push_subscriptions LIMIT ?')
    .bind(MAX_SUBSCRIPTIONS_PER_SWEEP).all<PushSubscriptionRow>();
  if (!results?.length) return;

  for (const sub of results) {
    try {
      const local = localNowIn(sub.tz);
      if (sub.last_sent_date === local.date) continue;
      const target = hhmmToMinutes(sub.reminder_time);
      if (local.minutes < target || local.minutes > target + CATCH_UP_MINUTES) continue;

      const stateRow = await getState(db, sub.user_id);
      if (!sessionOwedToday(stateRow ? stateRow.state_json : null, withTzDate(local, sub.tz))) {
        // Nothing owed today — mark the date so the remaining sweeps today skip the state read.
        await db.prepare('UPDATE push_subscriptions SET last_sent_date = ? WHERE endpoint = ?')
          .bind(local.date, sub.endpoint).run();
        continue;
      }

      const outcome = await sendEmptyPush(sub.endpoint, env);
      if (outcome === 'gone') {
        await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
        continue;
      }
      // Mark sent on success AND on transient error — one push per day, never a retry storm.
      await db.prepare('UPDATE push_subscriptions SET last_sent_date = ? WHERE endpoint = ?')
        .bind(local.date, sub.endpoint).run();
    } catch (err) {
      console.error('push sweep error for', sub.endpoint.slice(0, 40), err);
    }
  }
}

// LocalNow needs a way to render an arbitrary epoch in the subscription's zone for the
// completed-today check; attach it lazily so localNowIn stays a plain data producer.
interface LocalNowWithTz extends LocalNow {
  tzDate?: (epochMs: number) => string;
}
function withTzDate(local: LocalNow, tz: string): LocalNowWithTz {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return { ...local, tzDate: (epochMs: number) => fmt.format(new Date(epochMs)) };
}
