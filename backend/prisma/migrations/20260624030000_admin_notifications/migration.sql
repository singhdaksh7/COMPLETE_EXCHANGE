-- Stage 8B — Admin operational notifications (admin notification center)
--
-- Additive only: 1 new table (admin_notifications). No existing table is
-- altered. This table never moves money and never relaxes a check; it records
-- derived operational notifications for admins. Rows are idempotent on
-- dedupe_key so a repeated refresh never duplicates a signal.
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as the rest of the schema):
--   * CREATE TABLE IF NOT EXISTS with only the id PK
--   * columns via ADD COLUMN IF NOT EXISTS, then NOT NULL
--   * CREATE [UNIQUE] INDEX IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "admin_notifications" (
  "id" UUID NOT NULL,
  CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'INFO';
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "target_type" TEXT;
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "target_id" TEXT;
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "is_read" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP(3);
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "read_by_admin_id" UUID;
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "admin_notifications" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "admin_notifications" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "admin_notifications" ALTER COLUMN "message" SET NOT NULL;
ALTER TABLE "admin_notifications" ALTER COLUMN "dedupe_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "admin_notifications_dedupe_key_key" ON "admin_notifications"("dedupe_key");
CREATE INDEX IF NOT EXISTS "admin_notifications_is_read_created_at_idx" ON "admin_notifications"("is_read", "created_at");
CREATE INDEX IF NOT EXISTS "admin_notifications_type_idx" ON "admin_notifications"("type");
