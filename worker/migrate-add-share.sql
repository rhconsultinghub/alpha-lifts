-- Plan share links (src/share.ts). Apply once:
--   npx wrangler d1 execute alpha-lifts-db --remote --file=migrate-add-share.sql
-- Safe to re-run. Mirrored in schema.sql for fresh databases.

CREATE TABLE IF NOT EXISTS shared_plans (
  id          TEXT PRIMARY KEY,     -- short random id in the share URL
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_json   TEXT NOT NULL,        -- opaque PlanEnvelope; validated client-side on import
  created_at  INTEGER NOT NULL      -- epoch ms; per-user cap keeps only the newest 20
);

CREATE INDEX IF NOT EXISTS idx_shared_plans_user ON shared_plans(user_id);
