/**
 * Client half of accounts. Talks to the same Worker the coach uses (`COACH_API_URL`), just to
 * the /auth/* routes. Identity lives in its own localStorage keys — deliberately NOT inside the
 * synced AppState blob, since the account is what *owns* that blob; bundling them would mean a
 * restored backup could carry one account's session onto another device (the same reasoning that
 * keeps `deviceId` separate — see coach.ts).
 *
 * When the Worker URL isn't configured (`AUTH_CONFIGURED === false`), the whole account layer is
 * inert and the app runs anonymous + local-only, exactly as it did before accounts existed. This
 * is what lets a build with no backend — or the current deployment before its Worker URL is set —
 * keep working as a plain PWA.
 */

import { COACH_API_URL, COACH_CONFIGURED } from './coach';
import { getStoredToken, TOKEN_KEY } from './tokenStore';

export const AUTH_CONFIGURED = COACH_CONFIGURED;

const ACCOUNT_KEY = 'alpha-lifts-auth-account';

export interface Account {
  id: string;
  email: string;
  plan: string;
  subStatus: string;
  currentPeriodEnd: number | null;
}

// --- token + account persistence ------------------------------------------------------------

export function getToken(): string | null {
  return getStoredToken();
}

/** Cached account, shown immediately on reload so an authed user isn't bounced to the login
 *  screen while /auth/me is still in flight (or while offline). Revalidated in the background. */
export function getCachedAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function persistSession(token: string, account: Account): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    /* storage unavailable — session just won't survive a reload */
  }
}

function persistAccount(account: Account): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* ignore */
  }
}

// --- API calls ------------------------------------------------------------------------------

/**
 * Outcome of a signup/login attempt.
 * - 'session'    → logged in (token persisted).
 * - 'verify'     → signup succeeded but the account needs email confirmation before use.
 * - 'unverified' → login was correct but the email isn't confirmed yet.
 * - 'error'      → show `error`.
 */
export type AuthOutcome =
  | { kind: 'session'; token: string; account: Account }
  | { kind: 'verify'; email: string }
  | { kind: 'unverified'; email: string }
  | { kind: 'error'; error: string };

/** Map the Worker's machine error codes to human copy. Anything unrecognised falls through to a
 *  generic message rather than showing a raw code. */
function authErrorMessage(code: string): string {
  switch (code) {
    case 'invalid_email':
      return 'That doesn’t look like a valid email address.';
    case 'invalid_password':
      return 'Password must be at least 8 characters.';
    case 'email_taken':
      return 'An account with that email already exists. Try signing in instead.';
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'accounts_not_configured':
      return 'Accounts aren’t set up on the server yet.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

interface AuthBody {
  token?: string;
  account?: Account;
  error?: string;
  verification_required?: boolean;
  email?: string;
}

async function postAuth(path: string, body: unknown): Promise<{ res: Response; data: AuthBody } | null> {
  try {
    const res = await fetch(`${COACH_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = (await res.json().catch(() => ({}))) as AuthBody;
    return { res, data };
  } catch {
    return null;
  }
}

export async function signup(email: string, password: string): Promise<AuthOutcome> {
  if (!AUTH_CONFIGURED) return { kind: 'error', error: authErrorMessage('accounts_not_configured') };
  const r = await postAuth('/auth/signup', { email, password });
  if (!r) return { kind: 'error', error: 'Can’t reach the server. Check your connection and try again.' };
  const { res, data } = r;
  // Verification on: no session yet — the user must confirm their email first.
  if (res.ok && data.verification_required) return { kind: 'verify', email: data.email ?? email };
  if (res.ok && data.token && data.account) {
    persistSession(data.token, data.account);
    return { kind: 'session', token: data.token, account: data.account };
  }
  return { kind: 'error', error: authErrorMessage(data.error ?? '') };
}

export async function login(email: string, password: string): Promise<AuthOutcome> {
  if (!AUTH_CONFIGURED) return { kind: 'error', error: authErrorMessage('accounts_not_configured') };
  const r = await postAuth('/auth/login', { email, password });
  if (!r) return { kind: 'error', error: 'Can’t reach the server. Check your connection and try again.' };
  const { res, data } = r;
  if (res.status === 403 && data.error === 'email_not_verified') {
    return { kind: 'unverified', email: data.email ?? email };
  }
  if (res.ok && data.token && data.account) {
    persistSession(data.token, data.account);
    return { kind: 'session', token: data.token, account: data.account };
  }
  return { kind: 'error', error: authErrorMessage(data.error ?? '') };
}

/** Ask the server to re-send a verification email. Fire-and-forget: the server always answers 200
 *  and never reveals whether the address exists, so there's nothing meaningful to surface but a
 *  neutral "sent" confirmation. */
export async function resendVerification(email: string): Promise<void> {
  if (!AUTH_CONFIGURED) return;
  try {
    await fetch(`${COACH_API_URL}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
  } catch {
    /* best-effort */
  }
}

/** Ask the server to email a password-reset link. Same neutral contract as resendVerification —
 *  always 200 server-side, no account-existence signal, so the UI just says "check your email". */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!AUTH_CONFIGURED) return;
  try {
    await fetch(`${COACH_API_URL}/auth/request-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Change the signed-in account's password. On success the server has bumped token_version —
 * revoking every other session — and returns a fresh token for THIS one, persisted here so the
 * current device stays signed in.
 */
export async function changePassword(
  token: string,
  oldPassword: string,
  newPassword: string
): Promise<{ ok: true; token: string; account: Account } | { ok: false; error: string }> {
  if (!AUTH_CONFIGURED) return { ok: false, error: authErrorMessage('accounts_not_configured') };
  try {
    const res = await fetch(`${COACH_API_URL}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = (await res.json().catch(() => ({}))) as AuthBody;
    if (res.ok && data.token && data.account) {
      persistSession(data.token, data.account);
      // Caller must also push the new pair into AuthContext (refreshSession) — the change bumped
      // token_version server-side, so the token the React tree is holding is now revoked.
      return { ok: true, token: data.token, account: data.account };
    }
    if (res.status === 401) return { ok: false, error: 'Current password is incorrect.' };
    return { ok: false, error: authErrorMessage(data.error ?? '') };
  } catch {
    return { ok: false, error: 'Can’t reach the server. Check your connection and try again.' };
  }
}

export type MeResult =
  | { ok: true; account: Account }
  // `reason` distinguishes "the token is bad, sign out" (unauthorized) from "couldn't reach the
  // server, stay signed in on cache" (network) — the gate treats them very differently.
  | { ok: false; reason: 'unauthorized' | 'network' };

/** Validate the stored token and refresh the cached account. Called on app start when a token
 *  exists. A network failure must NOT sign the user out — an offline PWA has to keep working. */
export async function fetchMe(token: string): Promise<MeResult> {
  if (!AUTH_CONFIGURED) return { ok: false, reason: 'network' };
  let res: Response;
  try {
    res = await fetch(`${COACH_API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (res.status === 401) return { ok: false, reason: 'unauthorized' };
  if (!res.ok) return { ok: false, reason: 'network' };
  try {
    const data = (await res.json()) as { account?: Account };
    if (!data.account) return { ok: false, reason: 'network' };
    persistAccount(data.account);
    return { ok: true, account: data.account };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
