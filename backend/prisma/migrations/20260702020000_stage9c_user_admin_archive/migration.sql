-- Stage 9C — User/Admin soft-delete (archive) + admin password reset
--
-- Additive only. No table is dropped and no existing row is deleted or made
-- NOT NULL. This migration NEVER removes users or admins physically; it only
-- adds the audit anchors used by the soft-delete / archive and admin
-- password-reset flows.
--
--   * users:  deleted_by_admin_id, deletion_reason  (deleted_at already exists
--             from the frozen baseline and is the archive marker).
--   * admins: must_change_password, password_reset_at, password_reset_by  for
--             the SUPER_ADMIN-initiated password reset (temporary password is
--             never stored in plaintext; only the argon2 hash is written).
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as the rest of the schema).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_by_admin_id" UUID;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletion_reason" TEXT;

ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "password_reset_at" TIMESTAMP(3);
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "password_reset_by" UUID;

-- Partial index to list archived users efficiently in the "Deleted Users" tab.
CREATE INDEX IF NOT EXISTS "users_deleted_at_idx" ON "users"("deleted_at") WHERE "deleted_at" IS NOT NULL;
