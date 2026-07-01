-- Stage 7A: admin lifecycle + activity traceability.
-- Additive only. Adds soft-deactivation + audit anchors to the `admins` table.
-- Admin rows are NEVER hard-deleted; deactivation is access removal only, so all
-- historical admin_logs remain traceable forever (FIU accountability).
--
-- Every column is nullable except `updated_at`, which is backfilled to the
-- current timestamp for existing rows via its DEFAULT, so this migration is
-- fully backward-compatible and safe to apply to a populated staging DB.

ALTER TABLE "admins" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "admins" ADD COLUMN "last_login_at" TIMESTAMP(3);
ALTER TABLE "admins" ADD COLUMN "created_by" UUID;
ALTER TABLE "admins" ADD COLUMN "deactivated_at" TIMESTAMP(3);
ALTER TABLE "admins" ADD COLUMN "deactivated_by" UUID;
ALTER TABLE "admins" ADD COLUMN "deactivation_reason" TEXT;
