-- One-time migration for DBs created before the 2026-08 password-security round.
-- Adds per-user token versioning (session revocation) + forgot-password reset columns, and the
-- token-lookup indexes. Run BEFORE (or after — the Worker reads the new columns defensively)
-- deploying the Worker that uses them:
--   npx wrangler d1 execute alpha-lifts-db --remote --file=migrate-add-password-security.sql
-- D1 has no IF NOT EXISTS on ALTER; if a statement fails with "duplicate column name" the
-- migration has already been applied and the failure is safe to ignore.

ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN reset_token TEXT;
ALTER TABLE users ADD COLUMN reset_expires INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users(verify_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
