/**
 * Auth + state route handlers. index.ts routes to these by path; they own the HTTP shape of
 * accounts and cloud sync. Identity always comes from the verified session token (see auth.ts),
 * never from the request body — a handler that needs "who is this" calls `authenticate()` and
 * 401s on null.
 */

import {
  authenticate,
  hashIterations,
  hashPassword,
  sessionTokenVersion,
  signSession,
  verifyPassword,
  PBKDF2_ITERATIONS
} from './auth';
import {
  applyPasswordReset,
  clearVerifyToken,
  createUser,
  findUserByEmail,
  findUserById,
  findUserByResetToken,
  findUserByVerifyToken,
  getState,
  markEmailVerified,
  putState,
  putStateChecked,
  rehashPassword,
  setResetToken,
  setVerifyToken,
  toAccountView,
  updatePassword,
  userTokenVersion,
  type UserRow
} from './db';
import { newResetToken, newVerifyToken, sendResetEmail, sendVerificationEmail, verificationEnabled, verificationRequired } from './email';
import { json } from './http';
import { readJsonCapped, MAX_AUTH_BODY_BYTES, MAX_STATE_BODY_BYTES } from './guard';

export interface RouteEnv {
  DB?: D1Database;
  SESSION_SECRET?: string;
  // Email verification (email.ts). When RESEND_API_KEY is set, signup requires email confirmation
  // before login; when it's absent the whole flow is inert (signup verifies instantly).
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  // "true" = keep blocking unverified logins even without the Resend key (see email.ts).
  REQUIRE_EMAIL_VERIFICATION?: string;
  // Where the /auth/verify page sends the user back to after confirming. Defaults to the live app.
  APP_URL?: string;
  // Shared KV namespace (same binding the budget/allowlist use) — here it backs the per-email
  // send cooldown that stops signup/resend from being used as an email-spam relay.
  USAGE?: KVNamespace;
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

/** Auth bodies are an email + password; anything bigger than a few KB is not a real client. */
async function readAuthBody<T>(request: Request): Promise<T | null> {
  const read = await readJsonCapped<T>(request, MAX_AUTH_BODY_BYTES);
  return read.ok ? read.value : null;
}

/**
 * Authenticate AND load the user row, enforcing the token-version check: a token whose `tv`
 * claim doesn't match users.token_version was issued before a password change/reset and is
 * revoked. Every route that acts as the user goes through this, so revocation actually bites
 * (a pure-JWT check couldn't — the whole point of the version is that it lives server-side).
 */
async function authedUser(
  request: Request,
  cfg: { db: D1Database; secret: string }
): Promise<UserRow | null> {
  const session = await authenticate(request, cfg.secret);
  if (!session) return null;
  const user = await findUserById(cfg.db, session.sub);
  if (!user) return null;
  if (sessionTokenVersion(session) !== userTokenVersion(user)) return null;
  return user;
}

/**
 * At most one verification email per address per minute, across signup + resend. KV-backed
 * (60s is KV's minimum TTL — exactly the cooldown we want). Returns true when a send is
 * allowed *and* claims the slot. Fails open without KV: the per-IP rate limiter still applies.
 */
async function claimEmailSendSlot(env: RouteEnv, email: string): Promise<boolean> {
  const kv = env.USAGE;
  if (!kv) return true;
  const key = `emailcd:${email}`;
  if (await kv.get(key)) return false;
  await kv.put(key, '1', { expirationTtl: 60 });
  return true;
}

// --- POST /auth/signup ----------------------------------------------------------------------

export async function handleSignup(request: Request, env: RouteEnv, cors: Cors, ctx?: ExecutionContext): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const body = await readAuthBody<{ email?: unknown; password?: unknown }>(request);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!validEmail(email)) return json({ error: 'invalid_email' }, 400, cors);
  if (password.length < MIN_PASSWORD_CHARS || password.length > MAX_PASSWORD_CHARS) {
    return json({ error: 'invalid_password' }, 400, cors);
  }

  // With verification ON, an already-registered address gets the SAME "check your email" 201 as
  // a fresh signup (no email is sent, and no account is touched) — a distinct 409 here was a
  // clean oracle for testing whether any address has an account. The 409 remains only when
  // verification is off, where signup returns a live session and can't be made uniform.
  const verifying = verificationEnabled(env);
  const existing = await findUserByEmail(cfg.db, email);
  if (existing) {
    if (verifying) return json({ verification_required: true, email }, 201, cors);
    return json({ error: 'email_taken' }, 409, cors);
  }

  const passwordHash = await hashPassword(password);

  // Verification on: create the account UNVERIFIED, email a confirmation link, and return NO
  // session — the user must confirm before they can sign in. This is what stops bogus/throwaway
  // signups from getting a working account. Even if the email send fails, the account exists
  // unverified so they can trigger a resend rather than being stuck mid-signup.
  if (verifying) {
    const { token, expires } = newVerifyToken();
    try {
      await createUser(cfg.db, email, passwordHash, { verified: false, token, expires });
    } catch {
      // Two signups for one email raced past the check above; the UNIQUE constraint caught the
      // loser. Answer exactly like the existing-account path — uniform, no oracle.
      return json({ verification_required: true, email }, 201, cors);
    }
    const verifyUrl = `${new URL(request.url).origin}/auth/verify?token=${encodeURIComponent(token)}`;
    if (await claimEmailSendSlot(env, email)) {
      // Fire-and-forget so the response doesn't wait on the email round-trip. waitUntil keeps the
      // send alive past the response; without a ctx (shouldn't happen in the Workers runtime) fall
      // back to a detached promise.
      const send = sendVerificationEmail(env, email, verifyUrl);
      if (ctx) ctx.waitUntil(send);
      else void send;
    }
    return json({ verification_required: true, email }, 201, cors);
  }

  // Verification off (no Resend configured): behave as before — create verified, sign straight in.
  let user;
  try {
    user = await createUser(cfg.db, email, passwordHash);
  } catch {
    return json({ error: 'email_taken' }, 409, cors); // lost a signup race on the UNIQUE index
  }
  const token = await signSession(user.id, cfg.secret);
  return json({ token, account: toAccountView(user) }, 201, cors);
}

// --- POST /auth/login -----------------------------------------------------------------------

export async function handleLogin(request: Request, env: RouteEnv, cors: Cors): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const body = await readAuthBody<{ email?: unknown; password?: unknown }>(request);
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

  // Correct password but email not confirmed. verificationRequired (not Enabled): enforcement
  // holds even if the Resend key is rotated out, instead of failing open. Surface it distinctly
  // so the client can offer a "resend link" instead of a generic failure.
  if (verificationRequired(env) && user.email_verified !== 1) {
    return json({ error: 'email_not_verified', email: user.email }, 403, cors);
  }

  // Transparent hash upgrade: a row hashed below the current iteration count gets re-hashed with
  // the password we just verified. Self-describing hash format makes this safe for old rows, and
  // the login path is the only place the plaintext is legitimately in hand.
  const iters = hashIterations(user.password_hash);
  if (iters !== null && iters < PBKDF2_ITERATIONS) {
    await rehashPassword(cfg.db, user.id, await hashPassword(password));
  }

  const token = await signSession(user.id, cfg.secret, userTokenVersion(user));
  return json({ token, account: toAccountView(user) }, 200, cors);
}

// A fixed PBKDF2 hash shape, used only to burn ~equivalent CPU on the user-not-found path (see
// handleLogin). Value is irrelevant (it never matches a real password) but the iteration count
// is DERIVED from the live constant — a hardcoded count silently diverged from real-row timing
// when the constant was raised, re-opening the timing side-channel the dummy exists to close.
const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

// --- /auth/verify (browser navigation from the email link) ----------------------------------
//
// GET shows a CONFIRM BUTTON page; the actual verification happens on the button's same-origin
// POST. It used to happen directly on the GET — but mail scanners and link-prefetchers follow
// GETs, so the single-use token was routinely consumed before the human ever clicked, and their
// own click then landed on "already used".

/** Only ever link back to an operator-controlled https URL — APP_URL is config today, but this
 *  is the one place a config value is interpolated into HTML, so validate + escape anyway. */
function safeAppUrl(env: RouteEnv): string {
  const url = env.APP_URL || DEFAULT_APP_URL;
  if (!/^https:\/\/[A-Za-z0-9./_-]+$/.test(url)) return DEFAULT_APP_URL;
  return url;
}

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

function verifyConfirmPage(token: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify email — Alpha Lifts</title></head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0e0d;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#f5f0ea">
    <div style="max-width:360px;padding:32px 24px;text-align:center">
      <div style="font-size:44px;margin-bottom:14px">📧</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-bottom:10px">Confirm your email</div>
      <div style="font-size:14px;line-height:1.6;color:#c9c3ba;margin-bottom:26px">One tap to activate your Alpha Lifts account.</div>
      <form method="POST" action="/auth/verify">
        <input type="hidden" name="token" value="${token}">
        <button type="submit" style="background:#f0752f;color:#1a1206;border:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px">Verify my email</button>
      </form>
    </div>
  </body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function handleVerify(request: Request, env: RouteEnv): Promise<Response> {
  const appUrl = safeAppUrl(env);
  const token = safeTokenOrNull(new URL(request.url).searchParams.get('token'));
  if (!env.DB || !token) return verifyPage(false, appUrl);

  // Deliberately no DB write here — just enough validation to show the right page.
  const user = await findUserByVerifyToken(env.DB, token);
  if (!user) return verifyPage(false, appUrl); // token not found (already used / invalid)
  if (user.verify_expires != null && user.verify_expires < Date.now()) {
    // Spent anyway — clear it so expired tokens don't accumulate on the row forever.
    await clearVerifyToken(env.DB, user.id).catch(() => {});
    return verifyPage(false, appUrl, 'expired');
  }
  return verifyConfirmPage(token);
}

export async function handleVerifySubmit(request: Request, env: RouteEnv): Promise<Response> {
  const appUrl = safeAppUrl(env);
  if (!env.DB) return verifyPage(false, appUrl);
  let token: string | null = null;
  try {
    const form = await request.formData();
    token = safeTokenOrNull(typeof form.get('token') === 'string' ? (form.get('token') as string) : null);
  } catch {
    return verifyPage(false, appUrl);
  }
  if (!token) return verifyPage(false, appUrl);

  const user = await findUserByVerifyToken(env.DB, token);
  if (!user) return verifyPage(false, appUrl);
  if (user.verify_expires != null && user.verify_expires < Date.now()) return verifyPage(false, appUrl, 'expired');

  await markEmailVerified(env.DB, user.id);
  return verifyPage(true, appUrl);
}

// --- POST /auth/resend-verification ---------------------------------------------------------

export async function handleResendVerification(request: Request, env: RouteEnv, cors: Cors, ctx?: ExecutionContext): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const body = await readAuthBody<{ email?: unknown }>(request);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  // Always 200 regardless — never reveal whether an email is registered. Only actually re-send for
  // a real, still-unverified account while verification is enabled, at most once a minute per
  // address (claimEmailSendSlot) so this can't be looped as an email-spam relay.
  if (verificationEnabled(env) && email) {
    const user = await findUserByEmail(cfg.db, email);
    if (user && user.email_verified !== 1 && (await claimEmailSendSlot(env, email))) {
      // Reuse a still-valid pending token rather than rotating: rotating on every call meant a
      // spammer could keep invalidating the link sitting in the real user's inbox.
      let token = user.verify_token;
      if (!token || user.verify_expires == null || user.verify_expires < Date.now()) {
        const fresh = newVerifyToken();
        token = fresh.token;
        await setVerifyToken(cfg.db, user.id, token, fresh.expires);
      }
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

  const user = await authedUser(request, cfg);
  if (!user) return json({ error: 'unauthorized' }, 401, cors);
  return json({ account: toAccountView(user) }, 200, cors);
}

// --- POST /auth/change-password --------------------------------------------------------------

export async function handleChangePassword(request: Request, env: RouteEnv, cors: Cors): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const user = await authedUser(request, cfg);
  if (!user) return json({ error: 'unauthorized' }, 401, cors);

  const body = await readAuthBody<{ oldPassword?: unknown; newPassword?: unknown }>(request);
  const oldPassword = typeof body?.oldPassword === 'string' ? body.oldPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

  if (!(await verifyPassword(oldPassword, user.password_hash))) {
    return json({ error: 'invalid_credentials' }, 401, cors);
  }
  if (newPassword.length < MIN_PASSWORD_CHARS || newPassword.length > MAX_PASSWORD_CHARS) {
    return json({ error: 'invalid_password' }, 400, cors);
  }

  // updatePassword bumps token_version, revoking every outstanding session (including the one
  // that made this request) — so hand back a fresh token minted at the new version.
  const newVersion = await updatePassword(cfg.db, user.id, await hashPassword(newPassword));
  const token = await signSession(user.id, cfg.secret, newVersion);
  return json({ token, account: toAccountView(user) }, 200, cors);
}

// --- GET /state -----------------------------------------------------------------------------

export async function handleGetState(request: Request, env: RouteEnv, cors: Cors): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const user = await authedUser(request, cfg);
  if (!user) return json({ error: 'unauthorized' }, 401, cors);

  const row = await getState(cfg.db, user.id);
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

  const user = await authedUser(request, cfg);
  if (!user) return json({ error: 'unauthorized' }, 401, cors);

  const read = await readJsonCapped<{ state?: unknown; baseVersion?: unknown }>(request, MAX_STATE_BODY_BYTES);
  if (!read.ok && read.reason === 'too_large') return json({ error: 'state_too_large' }, 413, cors);
  const body = read.ok ? read.value : null;
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
  // Real byte length, not UTF-16 code units — String.length undercounts multi-byte text ~3x.
  if (new TextEncoder().encode(stateJson).byteLength > MAX_STATE_BYTES) {
    return json({ error: 'state_too_large' }, 413, cors);
  }

  // Optimistic concurrency: when the client says which server version its blob was based on,
  // the write only lands if the row is still at that version — otherwise 409 with the current
  // server state so the client can reconcile (last-write-wins by timestamp, client-side) instead
  // of silently clobbering another device's push. Omitting baseVersion keeps the old
  // unconditional behaviour, so previously-deployed clients keep working unchanged.
  const rawBase = (body as { baseVersion?: unknown }).baseVersion;
  const baseVersion =
    typeof rawBase === 'number' && Number.isInteger(rawBase) && rawBase >= 0 ? rawBase : null;

  if (baseVersion != null) {
    const result = await putStateChecked(cfg.db, user.id, stateJson, baseVersion);
    if (!result.ok) {
      let state: unknown = null;
      try {
        state = result.current ? JSON.parse(result.current.state_json) : null;
      } catch {
        state = null;
      }
      return json(
        {
          error: 'version_conflict',
          state,
          version: result.current?.version ?? 0,
          updatedAt: result.current?.updated_at ?? 0
        },
        409,
        cors
      );
    }
    return json({ version: result.row.version, updatedAt: result.row.updated_at }, 200, cors);
  }

  const row = await putState(cfg.db, user.id, stateJson);
  return json({ version: row.version, updatedAt: row.updated_at }, 200, cors);
}

// --- Forgot-password flow --------------------------------------------------------------------
//
// POST /auth/request-reset  (CORS route, called by the app's login screen; always 200 — no
//                            account-existence oracle)
// GET  /auth/reset?token=…  (top-level browser navigation from the email link, like
//                            /auth/verify — bypasses the Origin gate, serves an HTML form)
// POST /auth/reset          (the form's same-origin submit — also bypasses the Origin gate;
//                            safe because the single-use token IS the authentication)

export async function handleRequestReset(request: Request, env: RouteEnv, cors: Cors, ctx?: ExecutionContext): Promise<Response> {
  const cfg = requireConfig(env, cors);
  if (cfg instanceof Response) return cfg;

  const body = await readAuthBody<{ email?: unknown }>(request);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  // Only actually send when Resend is configured and the account exists — the response is
  // identical either way, and the per-address cooldown stops loop-spamming a real inbox.
  if (env.RESEND_API_KEY && email) {
    const user = await findUserByEmail(cfg.db, email);
    if (user && (await claimEmailSendSlot(env, email))) {
      const { token, expires } = newResetToken();
      await setResetToken(cfg.db, user.id, token, expires);
      const resetUrl = `${new URL(request.url).origin}/auth/reset?token=${encodeURIComponent(token)}`;
      const send = sendResetEmail(env, email, resetUrl);
      if (ctx) ctx.waitUntil(send);
      else void send;
    }
  }
  return json({ ok: true }, 200, cors);
}

/** Tokens are our own base64url — anything else never matches and must not reach the HTML. */
function safeTokenOrNull(raw: string | null): string | null {
  return raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
}

function resetPage(inner: string, title: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Alpha Lifts</title></head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0e0d;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#f5f0ea">
    <div style="max-width:360px;width:100%;padding:32px 24px;text-align:center">${inner}</div>
  </body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function resetMessagePage(emoji: string, title: string, msg: string, appUrl: string): Response {
  return resetPage(
    `<div style="font-size:44px;margin-bottom:14px">${emoji}</div>
     <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-bottom:10px">${title}</div>
     <div style="font-size:14px;line-height:1.6;color:#c9c3ba;margin-bottom:26px">${msg}</div>
     <a href="${appUrl}" style="display:inline-block;background:#f0752f;color:#1a1206;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px">Open Alpha Lifts</a>`,
    title
  );
}

function resetFormPage(token: string, error?: string): Response {
  return resetPage(
    `<div style="font-size:44px;margin-bottom:14px">🔑</div>
     <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-bottom:10px">Set a new password</div>
     ${error ? `<div style="font-size:13px;color:#e08a8a;margin-bottom:12px">${error}</div>` : ''}
     <form method="POST" action="/auth/reset" style="text-align:left">
       <input type="hidden" name="token" value="${token}">
       <label style="display:block;font-size:11px;letter-spacing:.04em;color:#8a857d;margin-bottom:6px">NEW PASSWORD (AT LEAST 8 CHARACTERS)</label>
       <input type="password" name="password" minlength="8" required autocomplete="new-password"
         style="width:100%;box-sizing:border-box;background:#1c1915;border:1px solid rgba(255,255,255,.15);border-radius:12px;color:#f5f0ea;font-size:15px;padding:13px 14px;margin-bottom:14px">
       <button type="submit" style="width:100%;background:#f0752f;color:#1a1206;border:none;font-weight:700;font-size:15px;padding:13px;border-radius:12px">Save new password</button>
     </form>`,
    'Reset password'
  );
}

export async function handleResetPage(request: Request, env: RouteEnv): Promise<Response> {
  const appUrl = safeAppUrl(env);
  const token = safeTokenOrNull(new URL(request.url).searchParams.get('token'));
  if (!env.DB || !token) return resetMessagePage('⚠️', 'Invalid link', 'That reset link is invalid or has already been used.', appUrl);

  const user = await findUserByResetToken(env.DB, token);
  if (!user) return resetMessagePage('⚠️', 'Invalid link', 'That reset link is invalid or has already been used.', appUrl);
  if (user.reset_expires != null && user.reset_expires < Date.now()) {
    return resetMessagePage('⚠️', 'Link expired', 'That reset link has expired. Request a new one from the sign-in screen.', appUrl);
  }
  return resetFormPage(token);
}

export async function handleResetSubmit(request: Request, env: RouteEnv): Promise<Response> {
  const appUrl = safeAppUrl(env);
  if (!env.DB) return resetMessagePage('⚠️', 'Not available', 'Password reset isn’t configured on this server.', appUrl);

  let token: string | null = null;
  let password = '';
  try {
    const form = await request.formData();
    token = safeTokenOrNull(typeof form.get('token') === 'string' ? (form.get('token') as string) : null);
    password = typeof form.get('password') === 'string' ? (form.get('password') as string) : '';
  } catch {
    return resetMessagePage('⚠️', 'Invalid request', 'That didn’t come from the reset form. Use the link from your email.', appUrl);
  }
  if (!token) return resetMessagePage('⚠️', 'Invalid link', 'That reset link is invalid or has already been used.', appUrl);

  const user = await findUserByResetToken(env.DB, token);
  if (!user) return resetMessagePage('⚠️', 'Invalid link', 'That reset link is invalid or has already been used.', appUrl);
  if (user.reset_expires != null && user.reset_expires < Date.now()) {
    return resetMessagePage('⚠️', 'Link expired', 'That reset link has expired. Request a new one from the sign-in screen.', appUrl);
  }
  if (password.length < MIN_PASSWORD_CHARS || password.length > MAX_PASSWORD_CHARS) {
    return resetFormPage(token, 'Password must be 8–200 characters.');
  }

  // New hash + spent token cleared + token_version bump (revokes every outstanding session,
  // which is exactly what "I lost control of my password" needs) + email marked verified.
  await applyPasswordReset(env.DB, user.id, await hashPassword(password));
  return resetMessagePage('✅', 'Password updated', 'Your new password is set. Sign in to Alpha Lifts with it now.', appUrl);
}
