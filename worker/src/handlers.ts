/**
 * Auth + state route handlers. index.ts routes to these by path; they own the HTTP shape of
 * accounts and cloud sync. Identity always comes from the verified session token (see auth.ts),
 * never from the request body — a handler that needs "who is this" calls `authenticate()` and
 * 401s on null.
 */

import { authenticate, hashPassword, signSession, verifyPassword } from './auth';
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByVerifyToken,
  getState,
  markEmailVerified,
  putState,
  setVerifyToken,
  toAccountView
} from './db';
import { newVerifyToken, sendVerificationEmail, verificationEnabled } from './email';
import { json } from './http';

export interface RouteEnv {
  DB?: D1Database;
  SESSION_SECRET?: string;
  // Email verification (email.ts). When RESEND_API_KEY is set, signup requires email confirmation
  // before login; when it's absent the whole flow is inert (signup verifies instantly).
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  // Where the /auth/verify page sends the user back to after confirming. Defaults to the live app.
  APP_URL?: string;
}

const DEFAULT_APP_URL = 'https://rhconsultinghub.github.io/alpha-lifts/';

type Cors = Record<string, string>;

// Basic input limits. Not security controls (the DB + hashing are), just guards against a giant
// body or an obviously-bad address before we do any work.
const MAX_EMAIL_CHARS = 254;
const MIN_PASSWORD_CHARS = 8;
const MAX_PASSWORD_CHARS = 200;
// Whole-state cap. The app's state is a handful of KB in normal use; this stops a runaway or
// malicious blob from being written. D1 rows can hold far more, but there's no reason to.
const MAX_STATE_BYTES = 2_000_000; // ~2 MB

function validEmail(email: string): boolean {
  // Deliberately loose — real validation is "can they receive mail there", which we don't check.
  // This only rejects clearly-malformed input.
  return email.length <= MAX_EMAIL_CHARS && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** A configured Worker must have both bindings. If not, every account route 503s with a clear
 *  message rather than throwing — makes a half-finished deploy obvious instead of cryptic. */
function requireConfig(env: RouteEnv, cors: Cors): { db: D1Database; secret: string } | Response {
  if (!env.DB || !env.SESSION_SECRET) {
    return json({ error: 'accounts_not_configured' }, 503, cors);
  }
  return { db: env.DB, secret: env.SESSION_SECRET };
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

// --- POST /auth/signup ----------------------------------------------------------------------

export async function handleSignup(request: Request, env: RouteEnv, cors: Cors, ctx?: ExecutionContext): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const body = await readJson<{ email?: unknown; password?: unknown }>(request);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!validEmail(email)) return json({ error: 'invalid_email' }, 400, cors);
  if (password.length < MIN_PASSWORD_CHARS || password.length > MAX_PASSWORD_CHARS) {
    return json({ error: 'invalid_password' }, 400, cors);
  }

  const existing = await findUserByEmail(cfg.db, email);
  if (existing) return json({ error: 'email_taken' }, 409, cors);

  const passwordHash = await hashPassword(password);

  // Verification on: create the account UNVERIFIED, email a confirmation link, and return NO
  // session — the user must confirm before they can sign in. This is what stops bogus/throwaway
  // signups from getting a working account. Even if the email send fails, the account exists
  // unverified so they can trigger a resend rather than being stuck mid-signup.
  if (verificationEnabled(env)) {
    const { token, expires } = newVerifyToken();
    await createUser(cfg.db, email, passwordHash, { verified: false, token, expires });
    const verifyUrl = `${new URL(request.url).origin}/auth/verify?token=${encodeURIComponent(token)}`;
    // Fire-and-forget so the response doesn't wait on the email round-trip. waitUntil keeps the
    // send alive past the response; without a ctx (shouldn't happen in the Workers runtime) fall
    // back to a detached promise.
    const send = sendVerificationEmail(env, email, verifyUrl);
    if (ctx) ctx.waitUntil(send);
    else void send;
    return json({ verification_required: true, email }, 201, cors);
  }

  // Verification off (no Resend configured): behave as before — create verified, sign straight in.
  const user = await createUser(cfg.db, email, passwordHash);
  const token = await signSession(user.id, cfg.secret);
  return json({ token, account: toAccountView(user) }, 201, cors);
}

// --- POST /auth/login -----------------------------------------------------------------------

export async function handleLogin(request: Request, env: RouteEnv, cors: Cors): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const body = await readJson<{ email?: unknown; password?: unknown }>(request);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const user = await findUserByEmail(cfg.db, email);
  // Verify against a dummy hash even when the user doesn't exist, so a missing account and a wrong
  // password take about the same time — doesn't leak "this email is registered" via timing. Same
  // generic error either way.
  const ok = user
    ? await verifyPassword(password, user.password_hash)
    : (await verifyPassword(password, DUMMY_HASH), false);
  if (!user || !ok) return json({ error: 'invalid_credentials' }, 401, cors);

  // Correct password but email not confirmed (only enforced when verification is on). Surface it
  // distinctly so the client can offer a "resend link" instead of a generic failure.
  if (verificationEnabled(env) && user.email_verified !== 1) {
    return json({ error: 'email_not_verified', email: user.email }, 403, cors);
  }

  const token = await signSession(user.id, cfg.secret);
  return json({ token, account: toAccountView(user) }, 200, cors);
}

// A fixed PBKDF2 hash of a random string, used only to burn ~equivalent CPU on the
// user-not-found path (see handleLogin). Value is irrelevant; it never matches a real password.
const DUMMY_HASH =
  'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// --- GET /auth/verify (browser navigation from the email link) ------------------------------

/** A small dark-themed HTML page for the email-link landing. No CORS/JSON — it's a top-level
 *  navigation, so it returns a human page with a button back into the app. */
function verifyPage(success: boolean, appUrl: string, reason?: string): Response {
  const title = success ? 'Email verified' : 'Couldn’t verify';
  const emoji = success ? '✅' : '⚠️';
  const msg = success
    ? 'Your email is confirmed. You can sign in to Alpha Lifts now.'
    : reason === 'expired'
      ? 'That verification link has expired. Sign in and request a new one.'
      : 'That verification link is invalid or has already been used.';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Alpha Lifts</title></head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0e0d;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#f5f0ea">
    <div style="max-width:360px;padding:32px 24px;text-align:center">
      <div style="font-size:44px;margin-bottom:14px">${emoji}</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-bottom:10px">${title}</div>
      <div style="font-size:14px;line-height:1.6;color:#c9c3ba;margin-bottom:26px">${msg}</div>
      <a href="${appUrl}" style="display:inline-block;background:#f0752f;color:#1a1206;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px">Open Alpha Lifts</a>
    </div>
  </body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function handleVerify(request: Request, env: RouteEnv): Promise<Response> {
  const appUrl = env.APP_URL || DEFAULT_APP_URL;
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!env.DB || !token) return verifyPage(false, appUrl);

  const user = await findUserByVerifyToken(env.DB, token);
  if (!user) return verifyPage(false, appUrl); // token not found (already used / invalid)
  if (user.verify_expires != null && user.verify_expires < Date.now()) return verifyPage(false, appUrl, 'expired');

  await markEmailVerified(env.DB, user.id);
  return verifyPage(true, appUrl);
}

// --- POST /auth/resend-verification ---------------------------------------------------------

export async function handleResendVerification(request: Request, env: RouteEnv, cors: Cors, ctx?: ExecutionContext): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const body = await readJson<{ email?: unknown }>(request);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  // Always 200 regardless — never reveal whether an email is registered. Only actually re-send for
  // a real, still-unverified account while verification is enabled.
  if (verificationEnabled(env) && email) {
    const user = await findUserByEmail(cfg.db, email);
    if (user && user.email_verified !== 1) {
      const { token, expires } = newVerifyToken();
      await setVerifyToken(cfg.db, user.id, token, expires);
      const verifyUrl = `${new URL(request.url).origin}/auth/verify?token=${encodeURIComponent(token)}`;
      const send = sendVerificationEmail(env, email, verifyUrl);
      if (ctx) ctx.waitUntil(send);
      else void send;
    }
  }
  return json({ ok: true }, 200, cors);
}

// --- GET /auth/me ---------------------------------------------------------------------------

export async function handleMe(request: Request, env: RouteEnv, cors: Cors): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const session = await authenticate(request, cfg.secret);
  if (!session) return json({ error: 'unauthorized' }, 401, cors);

  const user = await findUserById(cfg.db, session.sub);
  if (!user) return json({ error: 'unauthorized' }, 401, cors);
  return json({ account: toAccountView(user) }, 200, cors);
}

// --- GET /state -----------------------------------------------------------------------------

export async function handleGetState(request: Request, env: RouteEnv, cors: Cors): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const session = await authenticate(request, cfg.secret);
  if (!session) return json({ error: 'unauthorized' }, 401, cors);

  const row = await getState(cfg.db, session.sub);
  if (!row) return json({ state: null, version: 0, updatedAt: 0 }, 200, cors);

  // state_json is stored as an opaque string; parse it so the client gets JSON, not a
  // string-in-JSON it has to double-parse. A corrupt row degrades to null rather than 500.
  let state: unknown = null;
  try {
    state = JSON.parse(row.state_json);
  } catch {
    state = null;
  }
  return json({ state, version: row.version, updatedAt: row.updated_at }, 200, cors);
}

// --- PUT /state -----------------------------------------------------------------------------

export async function handlePutState(request: Request, env: RouteEnv, cors: Cors): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const session = await authenticate(request, cfg.secret);
  if (!session) return json({ error: 'unauthorized' }, 401, cors);

  const body = await readJson<{ state?: unknown }>(request);
  if (body == null || typeof body !== 'object' || !('state' in body)) {
    return json({ error: 'missing_state' }, 400, cors);
  }
  // Re-serialize server-side so we store canonical JSON of exactly what we received (and reject
  // anything non-serializable). Size-check the serialized form, not the parsed object.
  let stateJson: string;
  try {
    stateJson = JSON.stringify((body as { state: unknown }).state);
  } catch {
    return json({ error: 'invalid_state' }, 400, cors);
  }
  if (stateJson.length > MAX_STATE_BYTES) return json({ error: 'state_too_large' }, 413, cors);

  const row = await putState(cfg.db, session.sub, stateJson);
  return json({ version: row.version, updatedAt: row.updated_at }, 200, cors);
}
