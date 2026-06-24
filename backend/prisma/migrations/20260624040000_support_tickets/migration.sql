-- Stage 8C — Internal support / operations tickets
--
-- Additive only: 2 new tables (support_tickets, support_ticket_notes). No
-- existing table is altered. These tables never move money and never relax a
-- check; they record an internal ops ticketing workflow handled by admins.
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as the rest of the schema):
--   * CREATE TABLE IF NOT EXISTS with only the id PK
--   * columns via ADD COLUMN IF NOT EXISTS, then NOT NULL
--   * CREATE INDEX IF NOT EXISTS
--   * FK constraints wrapped in DO/EXCEPTION duplicate_object

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" UUID NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "subject" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "assigned_admin_id" UUID;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "created_by_admin_id" UUID;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "closed_by_admin_id" UUID;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP(3);
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "support_tickets" ALTER COLUMN "subject" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");
CREATE INDEX IF NOT EXISTS "support_tickets_assigned_admin_id_idx" ON "support_tickets"("assigned_admin_id");
CREATE INDEX IF NOT EXISTS "support_tickets_user_id_idx" ON "support_tickets"("user_id");

CREATE TABLE IF NOT EXISTS "support_ticket_notes" (
  "id" UUID NOT NULL,
  CONSTRAINT "support_ticket_notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "support_ticket_notes" ADD COLUMN IF NOT EXISTS "ticket_id" UUID;
ALTER TABLE "support_ticket_notes" ADD COLUMN IF NOT EXISTS "author_admin_id" UUID;
ALTER TABLE "support_ticket_notes" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "support_ticket_notes" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "support_ticket_notes" ALTER COLUMN "ticket_id" SET NOT NULL;
ALTER TABLE "support_ticket_notes" ALTER COLUMN "body" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "support_ticket_notes_ticket_id_created_at_idx" ON "support_ticket_notes"("ticket_id", "created_at");

-- Foreign keys.
DO $$ BEGIN
  ALTER TABLE "support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "support_ticket_notes"
    ADD CONSTRAINT "support_ticket_notes_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
