-- Phase 16: Manual INR withdrawal (manual payout).
-- Additive only: new enums + new `inr_withdrawals` table. The shared
-- `inr_transactions` table and the INR deposit flow are left untouched.

-- CreateEnum
CREATE TYPE "InrWithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "InrPayoutMethod" AS ENUM ('UPI', 'BANK');

-- CreateTable
CREATE TABLE "inr_withdrawals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "status" "InrWithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "payout_method" "InrPayoutMethod" NOT NULL,
    "upi_id" TEXT,
    "account_number_enc" BYTEA,
    "account_last4" TEXT,
    "ifsc" TEXT,
    "holder_name" TEXT,
    "bank_name" TEXT,
    "lock_ledger_txn_id" UUID,
    "final_ledger_txn_id" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "paid_by" UUID,
    "paid_at" TIMESTAMP(3),
    "utr" TEXT,
    "admin_note" TEXT,
    "rejection_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inr_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inr_withdrawals_user_id_status_idx" ON "inr_withdrawals"("user_id", "status");

-- CreateIndex
CREATE INDEX "inr_withdrawals_status_created_at_idx" ON "inr_withdrawals"("status", "created_at");

-- AddForeignKey
ALTER TABLE "inr_withdrawals" ADD CONSTRAINT "inr_withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
