/**
 * Client half of Web Push workout reminders (worker/src/push.ts is the server half).
 *
 * Requires: the Worker configured (same URL as the coach), a signed-in session (subscriptions
 * are account-scoped), notification permission, and a live service worker registration — which
 * exists only in a production build (`npm run dev` runs no SW; the Settings toggle says so
 * rather than failing silently).
 */
import { COACH_API_URL, COACH_CONFIGURED } from './coach';
import { getStoredToken } from './tokenStore';

export const PUSH_CONFIGURED = COACH_CONFIGURED;

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'signed_out' | 'error';

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
}

async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  // getRegistration (not .ready): .ready never resolves under `npm run dev` where no SW is
  // registered, and this must fail fast with 'unsupported' there instead of hanging the toggle.
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ?? null;
}

/** Subscribe this device and register it with the Worker. Re-run on reminder-time changes —
 *  the Worker upserts on the endpoint, so this is idempotent. */
export async function subscribePush(reminderTime: string): Promise<PushResult> {
  if (!PUSH_CONFIGURED) return 'unsupported';
  if (!getStoredToken()) return 'signed_out';
  const reg = await swRegistration();
  if (!reg) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  try {
    const cfgRes = await fetch(`${COACH_API_URL}/push/config`);
    const cfg = (await cfgRes.json()) as { enabled?: boolean; vapidPublicKey?: string | null };
    if (!cfg.enabled || !cfg.vapidPublicKey) return 'unsupported';

    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(cfg.vapidPublicKey).buffer as ArrayBuffer
    });

    const body = {
      ...sub.toJSON(), // endpoint + keys {p256dh, auth}
      reminderTime,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    };
    const res = await fetch(`${COACH_API_URL}/push/subscribe`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
    });
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

/** Drop the browser subscription and tell the Worker to forget this device. */
export async function unsubscribePush(): Promise<void> {
  try {
    const reg = await swRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    if (getStoredToken()) {
      await fetch(`${COACH_API_URL}/push/unsubscribe`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ endpoint })
      });
    }
  } catch {
    // Best effort — a dead endpoint also gets cleaned server-side on the next 410.
  }
}
