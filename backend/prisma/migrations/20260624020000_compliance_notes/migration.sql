-- Stage 5D — Per-user compliance notes (admin user profile)
--
-- Additive only: 1 new table (compliance_notes). No existing table is altered,
-- rewritten, or deleted. This table never moves money and does not relax any
-- existing compliance / KYC / risk check; it only records free-text admin notes
-- on a user. Append-only in the application layer (no edit/delete path).
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as the rest of Stage 5.x):
--   * CREATE TABLE IF NOT EXISTS with only the id PK
--   * columns via ADD COLUMN IF NOT EXISTS, then NOT NULL
--   * CREATE INDEX IF NOT EXISTS
--   * FK constraint wrapped in DO/EXCEPTION duplicate_object

CREATE TABLE IF NOT EXISTS "compliance_notes" (
  "id" UUID NOT NULL,
  CONSTRAINT "compliance_notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "compliance_notes" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "compliance_notes" ADD COLUMN IF NOT EXISTS "admin_id" UUID;
ALTER TABLE "compliance_notes" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "compliance_notes" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "compliance_notes" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "compliance_notes" ALTER COLUMN "body" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "compliance_notes_user_id_created_at_idx"
  ON "compliance_notes"("user_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "compliance_notes"
    ADD CONSTRAINT "compliance_notes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
