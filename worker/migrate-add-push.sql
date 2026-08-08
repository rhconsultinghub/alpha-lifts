-- Web Push workout reminders (src/push.ts). One row per subscribed device; the endpoint is the
-- natural key (re-subscribing the same browser updates in place). Apply once:
--   npx wrangler d1 execute alpha-lifts-db --remote --file=migrate-add-push.sql
-- Safe to re-run (IF NOT EXISTS throughout). Also mirrored in schema.sql for fresh databases.

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
