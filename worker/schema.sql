-- Alpha Lifts — D1 schema.
--
-- Apply locally:   npx wrangler d1 execute alpha-lifts-db --local --file=schema.sql
-- Apply to prod:   npx wrangler d1 execute alpha-lifts-db --remote --file=schema.sql
--
-- Safe to re-run: every statement is IF NOT EXISTS, so this doubles as the migration for
-- adding a column later (add it here + as a separate ALTER, D1 has no "IF NOT EXISTS" on ALTER).

-- One row per account. `id` is the stable user id everything else keys on — it replaces the
-- throwaway device UUID the coach budget/allowlist used before accounts existed. Emails are
-- stored lowercased (the app lowercases before insert) so the UNIQUE index is case-insensitive
-- in practice without needing COLLATE NOCASE.
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,           -- crypto.randomUUID(), minted server-side at signup
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,              -- pbkdf2$<iterations>$<salt-b64>$<hash-b64>, see auth.ts
  created_at     INTEGER NOT NULL,           -- epoch ms

  -- Subscription fields. Defaulted so a brand-new account is a valid "free" row with no billing
  -- integration wired up yet — Phase 5 reads these; a later billing phase writes them.
  plan                TEXT NOT NULL DEFAULT 'free',    -- 'free' | 'pro'
  sub_status          TEXT NOT NULL DEFAULT 'none',    -- 'none' | 'active' | 'past_due' | 'canceled'
  current_period_end  INTEGER,                         -- epoch ms; NULL when not subscribed

  -- Email verification (see email.ts / handlers.ts). Only ENFORCED when RESEND_API_KEY is set;
  -- otherwise signup verifies immediately and these are inert. Adding to an existing DB: run the
  -- ALTER statements at the bottom of this file instead (D1 has no IF NOT EXISTS on ALTER).
  email_verified  INTEGER NOT NULL DEFAULT 0,          -- 0 = unverified, 1 = verified
  verify_token    TEXT,                                -- single-use token emailed at signup; NULL once used
  verify_expires  INTEGER,                             -- epoch ms the token expires

  -- Session revocation + password reset (2026-08 hardening round). token_version is embedded in
  -- every issued JWT (`tv` claim) and checked on authenticated routes; bumping it (password
  -- change/reset) revokes every earlier token for just that user. reset_token/expires back the
  -- forgot-password email flow. Adding to an existing DB: migrate-add-password-security.sql.
  token_version  INTEGER NOT NULL DEFAULT 0,
  reset_token    TEXT,                                 -- single-use forgot-password token; NULL once used
  reset_expires  INTEGER                               -- epoch ms the reset token expires
);

-- Token lookups on the verify/reset paths would otherwise full-scan users.
CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users(verify_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

-- One row per user: their entire AppState as a JSON blob. The app already persists its whole
-- state as a single localStorage value, so cloud sync is just that same blob, server-side and
-- keyed to the account. `version` + `updated_at` back the last-write-wins reconcile (see the
-- /state endpoints and the client sync layer).
CREATE TABLE IF NOT EXISTS user_state (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state_json  TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,    -- bumped on every push; the client's tie-breaker signal
  updated_at  INTEGER NOT NULL               -- epoch ms of the last push; drives LWW
);

-- Web Push workout reminders (src/push.ts). One row per subscribed device, endpoint-keyed.
-- Adding to an existing DB: migrate-add-push.sql (identical statements).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint        TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh          TEXT NOT NULL,          -- subscription public key (stored for future payload support)
  auth            TEXT NOT NULL,          -- subscription auth secret (same)
  reminder_time   TEXT NOT NULL DEFAULT '18:00',  -- HH:MM, user-local
  tz              TEXT NOT NULL DEFAULT 'UTC',    -- IANA zone captured at subscribe (DST-proof)
  last_sent_date  TEXT,                   -- user-local YYYY-MM-DD of the last reminder (or skip)
  created_at      INTEGER NOT NULL        -- epoch ms
);

CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
