-- Manual INR deposit core (Stage 3.4A)
-- Adds a MANUAL_BANK_CLEARING ledger account kind, user-submitted manual deposit
-- fields on inr_transactions (utr / method / proof_key) and an admin review trail
-- (reviewed_by FK, reviewed_at, rejection_reason). Crediting still flows through
-- the double-entry ledger on admin approval; this migration only adds state.
-- NOTE: ALTER TYPE ... ADD VALUE requires PostgreSQL 12+ inside a transaction.
-- The new account value is created here but only USED at runtime (findOrCreate),
-- never within this migration, so the single-transaction restriction is honoured.

-- AlterEnum: clearing account for manually-received bank/UPI funds
ALTER TYPE "AccountKind" ADD VALUE IF NOT EXISTS 'MANUAL_BANK_CLEARING';

-- AlterTable: manual deposit submission + admin review fields
ALTER TABLE "inr_transactions"
    ADD COLUMN "utr" TEXT,
    ADD COLUMN "method" TEXT,
    ADD COLUMN "proof_key" TEXT,
    ADD COLUMN "reviewed_by" UUID,
    ADD COLUMN "reviewed_at" TIMESTAMP(3),
    ADD COLUMN "rejection_reason" TEXT;

-- CreateIndex: duplicate-UTR guard. NULL utr rows (Razorpay) never collide
-- because PostgreSQL treats NULLs as distinct in a unique index.
CREATE UNIQUE INDEX "inr_transactions_provider_utr_key" ON "inr_transactions"("provider", "utr");

-- CreateIndex: pending-queue / dashboard ordering
CREATE INDEX "inr_transactions_status_created_at_idx" ON "inr_transactions"("status", "created_at");

-- AddForeignKey: reviewing admin (nullable; preserve the deposit if the admin is removed)
ALTER TABLE "inr_transactions" ADD CONSTRAINT "inr_transactions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
