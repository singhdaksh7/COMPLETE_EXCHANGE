-- Stage 3D — Session/device security: track when a session was last active.
--
-- Additive only: 1 nullable column on auth_sessions. No data is rewritten and
-- no existing behaviour changes. Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);
