/**
 * D1 data access. Every query lives here so the request handlers in index.ts stay about HTTP,
 * not SQL. All functions take the D1 binding explicitly; a Worker without the binding (e.g. a
 * build that hasn't created the database yet) simply can't call these — the auth/state routes
 * check for `env.DB` up front and 503 rather than crash.
 */

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
  plan: string;
  sub_status: string;
  current_period_end: number | null;
  email_verified: number; // 0 | 1
  verify_token: string | null;
  verify_expires: number | null;
  // Nullable in type (not schema) so code reads them defensively with `?? 0` / `?? null` — a
  // Worker deployed against a not-yet-migrated DB then behaves like version 0 instead of crashing.
  token_version?: number | null;
  reset_token?: string | null;
  reset_expires?: number | null;
}

/** The row's token version, treating a pre-migration DB (column absent → undefined) as 0. */
export function userTokenVersion(u: UserRow): number {
  return u.token_version ?? 0;
}

/** The subscription slice we expose to the client — never the password hash. */
export interface AccountView {
  id: string;
  email: string;
  plan: string;
  subStatus: string;
  currentPeriodEnd: number | null;
}

export function toAccountView(u: UserRow): AccountView {
  return {
    id: u.id,
    email: u.email,
    plan: u.plan,
    subStatus: u.sub_status,
    currentPeriodEnd: u.current_period_end
  };
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export interface NewUserVerification {
  /** false = start unverified with a pending token (email-verification flow on). */
  verified: boolean;
  token?: string | null;
  expires?: number | null;
}

export async function createUser(
  db: D1Database,
  email: string,
  passwordHash: string,
  verification: NewUserVerification = { verified: true }
): Promise<UserRow> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const emailVerified = verification.verified ? 1 : 0;
  const token = verification.token ?? null;
  const expires = verification.expires ?? null;
  await db
    .prepare(
      'INSERT INTO users (id, email, password_hash, created_at, email_verified, verify_token, verify_expires) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, email, passwordHash, now, emailVerified, token, expires)
    .run();
  return {
    id,
    email,
    password_hash: passwordHash,
    created_at: now,
    plan: 'free',
    sub_status: 'none',
    current_period_end: null,
    email_verified: emailVerified,
    verify_token: token,
    verify_expires: expires
  };
}

export async function findUserByVerifyToken(db: D1Database, token: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE verify_token = ?').bind(token).first<UserRow>();
}

/** Mark an account verified and clear its (now spent) token. */
export async function markEmailVerified(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?')
    .bind(userId)
    .run();
}

/** Issue a fresh token for an existing unverified account (resend flow). */
export async function setVerifyToken(db: D1Database, userId: string, token: string, expires: number): Promise<void> {
  await db
    .prepare('UPDATE users SET verify_token = ?, verify_expires = ? WHERE id = ?')
    .bind(token, expires, userId)
    .run();
}

/**
 * Replace the password hash and bump token_version in one statement — the bump is what revokes
 * every session issued before the change (their `tv` claim no longer matches). Returns the new
 * token_version so the caller can mint the user's replacement session.
 */
export async function updatePassword(db: D1Database, userId: string, passwordHash: string): Promise<number> {
  await db
    .prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .bind(passwordHash, userId)
    .run();
  const row = await findUserById(db, userId);
  return row ? userTokenVersion(row) : 1;
}

/** Drop a spent/expired verification token so dead tokens don't sit on the row forever. */
export async function clearVerifyToken(db: D1Database, userId: string): Promise<void> {
  await db.prepare('UPDATE users SET verify_token = NULL, verify_expires = NULL WHERE id = ?').bind(userId).run();
}

/** Replace ONLY the hash (transparent iteration upgrade on login) — deliberately no
 *  token_version bump, or every login after an iteration raise would revoke the user's other
 *  sessions. Revocation belongs to updatePassword/applyPasswordReset. */
export async function rehashPassword(db: D1Database, userId: string, passwordHash: string): Promise<void> {
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, userId).run();
}

/** Stage a forgot-password token on the account (replaces any earlier pending one). */
export async function setResetToken(db: D1Database, userId: string, token: string, expires: number): Promise<void> {
  await db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?').bind(token, expires, userId).run();
}

export async function findUserByResetToken(db: D1Database, token: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE reset_token = ?').bind(token).first<UserRow>();
}

/**
 * Complete a forgot-password reset: new hash, clear the spent token, revoke outstanding
 * sessions (token_version bump), and mark the email verified — completing a reset proves
 * control of the mailbox at least as strongly as the verification link does.
 */
export async function applyPasswordReset(db: D1Database, userId: string, passwordHash: string): Promise<void> {
  await db
    .prepare(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL, token_version = token_version + 1, email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?'
    )
    .bind(passwordHash, userId)
    .run();
}

export interface StateRow {
  state_json: string;
  version: number;
  updated_at: number;
}

export async function getState(db: D1Database, userId: string): Promise<StateRow | null> {
  return db
    .prepare('SELECT state_json, version, updated_at FROM user_state WHERE user_id = ?')
    .bind(userId)
    .first<StateRow>();
}

/**
 * Upsert the user's state blob. Returns the row that now lives in the DB (its new version +
 * updated_at), which the client stores as its sync baseline. `version` monotonically increases
 * so the client can tell "the server moved on since my last pull" apart from "same as mine".
 */
export async function putState(
  db: D1Database,
  userId: string,
  stateJson: string
): Promise<StateRow> {
  const now = Date.now();
  // ON CONFLICT bumps version off the *existing* row's value, so it keeps climbing across pushes
  // rather than resetting. First insert lands at version 1.
  await db
    .prepare(
      `INSERT INTO user_state (user_id, state_json, version, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         state_json = excluded.state_json,
         version    = user_state.version + 1,
         updated_at = excluded.updated_at`
    )
    .bind(userId, stateJson, now)
    .run();
  const row = await getState(db, userId);
  // getState can't be null immediately after an upsert, but the type says it can — fall back
  // defensively rather than assert.
  return row ?? { state_json: stateJson, version: 1, updated_at: now };
}

export type PutStateResult =
  | { ok: true; row: StateRow }
  | { ok: false; current: StateRow | null };

/**
 * Version-checked upsert — the optimistic-concurrency half of cloud sync. The client sends the
 * server version its blob was based on; if the row has moved past it (another device pushed in
 * between), nothing is written and the caller gets the current row back to reconcile against.
 * This is what stops a stale device from silently overwriting a newer device's whole state —
 * the single most likely real-data-loss path found in the 2026-08 audit.
 *
 * `baseVersion === 0` means "I believe no server state exists yet"; a lost race on the first
 * insert surfaces as a conflict the same way.
 */
export async function putStateChecked(
  db: D1Database,
  userId: string,
  stateJson: string,
  baseVersion: number
): Promise<PutStateResult> {
  const now = Date.now();
  if (baseVersion > 0) {
    const res = await db
      .prepare(
        'UPDATE user_state SET state_json = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?'
      )
      .bind(stateJson, now, userId, baseVersion)
      .run();
    if ((res.meta?.changes ?? 0) > 0) {
      const row = await getState(db, userId);
      return { ok: true, row: row ?? { state_json: stateJson, version: baseVersion + 1, updated_at: now } };
    }
    return { ok: false, current: await getState(db, userId) };
  }
  try {
    await db
      .prepare('INSERT INTO user_state (user_id, state_json, version, updated_at) VALUES (?, ?, 1, ?)')
      .bind(userId, stateJson, now)
      .run();
    return { ok: true, row: { state_json: stateJson, version: 1, updated_at: now } };
  } catch {
    // A row already exists (UNIQUE user_id) — the "no state yet" belief was stale.
    return { ok: false, current: await getState(db, userId) };
  }
}
