-- Admin Operations + Maker-Checker (Stage 3.4C).
-- Adds the first-approver trail for dual-approval manual INR deposits. The
-- second/final approver (or rejecter) continues to use reviewed_by. Additive
-- and safe: existing deposits keep NULL first_approved_by and behave as before.

ALTER TABLE "inr_transactions"
    ADD COLUMN "first_approved_by" UUID,
    ADD COLUMN "first_approved_at" TIMESTAMP(3);

-- First approver references an admin; preserve the deposit if the admin is removed.
ALTER TABLE "inr_transactions"
    ADD CONSTRAINT "inr_transactions_first_approved_by_fkey"
    FOREIGN KEY ("first_approved_by") REFERENCES "admins"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
