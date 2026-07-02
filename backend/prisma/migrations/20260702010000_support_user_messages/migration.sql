-- Stage 9A — User-facing support ticket conversations
--
-- Additive only:
--   * support_tickets: new nullable columns (ticket_number unique, reference_type,
--     reference_id, last_message_at, resolved_at). No column is made NOT NULL on
--     existing rows; legacy admin ops tickets keep working unchanged.
--   * support_ticket_messages: new table for the USER<->ADMIN conversation thread
--     (internal-note messages are admin-only). Never moves money.
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as the rest of the schema).

ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "ticket_number" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "reference_type" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "reference_id" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "last_message_at" TIMESTAMP(3);
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(3);

-- Unique (partial-friendly: Postgres allows many NULLs under a UNIQUE index).
CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_ticket_number_key" ON "support_tickets"("ticket_number");

CREATE TABLE IF NOT EXISTS "support_ticket_messages" (
  "id" UUID NOT NULL,
  CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "ticket_id" UUID;
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "sender_type" TEXT;
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "admin_id" UUID;
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "is_internal_note" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "support_ticket_messages" ALTER COLUMN "ticket_id" SET NOT NULL;
ALTER TABLE "support_ticket_messages" ALTER COLUMN "sender_type" SET NOT NULL;
ALTER TABLE "support_ticket_messages" ALTER COLUMN "body" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "support_ticket_messages_ticket_id_created_at_idx" ON "support_ticket_messages"("ticket_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "support_ticket_messages"
    ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
