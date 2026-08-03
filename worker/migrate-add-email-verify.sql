-- One-time migration: add email-verification columns to a `users` table that predates them.
--
-- Run ONCE against a DB created before this feature:
--   npx wrangler d1 execute alpha-lifts-db --local  --file=migrate-add-email-verify.sql
--   npx wrangler d1 execute alpha-lifts-db --remote --file=migrate-add-email-verify.sql
--
-- Do NOT run on a fresh DB — schema.sql's CREATE TABLE already defines these columns, and D1/SQLite
-- has no "IF NOT EXISTS" on ADD COLUMN, so re-running errors with "duplicate column".
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN verify_token TEXT;
ALTER TABLE users ADD COLUMN verify_expires INTEGER;

-- Grandfather every existing account as verified, so turning verification on (setting RESEND_API_KEY)
-- doesn't suddenly lock out people who signed up before it existed.
UPDATE users SET email_verified = 1;
