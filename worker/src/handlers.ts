/**
 * Auth + state route handlers. index.ts routes to these by path; they own the HTTP shape of
 * accounts and cloud sync. Identity always comes from the verified session token (see auth.ts),
 * never from the request body — a handler that needs "who is this" calls `authenticate()` and
 * 401s on null.
 */

import { authenticate, hashPassword, signSession, verifyPassword } from './auth';
import { createUser, findUserByEmail, findUserById, getState, putState, toAccountView } from './db';
import { json } from './http';

export interface RouteEnv {
  DB?: D1Database;
  SESSION_SECRET?: string;
}

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

export async function handleSignup(request: Request, env: RouteEnv, cors: Cors): Promise<Response> {
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

  const user = await createUser(cfg.db, email, await hashPassword(password));
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

  const token = await signSession(user.id, cfg.secret);
  return json({ token, account: toAccountView(user) }, 200, cors);
}

// A fixed PBKDF2 hash of a random string, used only to burn ~equivalent CPU on the
// user-not-found path (see handleLogin). Value is irrelevant; it never matches a real password.
const DUMMY_HASH =
  'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

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
