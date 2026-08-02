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

export async function createUser(db: D1Database, email: string, passwordHash: string): Promise<UserRow> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, email, passwordHash, now)
    .run();
  return {
    id,
    email,
    password_hash: passwordHash,
    created_at: now,
    plan: 'free',
    sub_status: 'none',
    current_period_end: null
  };
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
