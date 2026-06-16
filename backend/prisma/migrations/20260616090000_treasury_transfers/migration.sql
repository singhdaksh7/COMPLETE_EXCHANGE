-- Module 2 — Hot/Cold Wallet Foundation: approval-gated treasury transfers.
-- ADDITIVE ONLY. Introduces two enums + the treasury_transfers table and its
-- foreign keys. Touches no existing table's columns or constraints, so it is
-- safe to apply on a populated database (no data migration, no locks beyond the
-- new table's own DDL). Cold wallets reuse hot_wallets (tier = COLD); custody
-- money movement is a balanced ledger posting between the HOT_WALLET and
-- COLD_WALLET system accounts (see treasury.service.ts) — never a user balance.

-- CreateEnum
CREATE TYPE "TreasuryTransferType" AS ENUM ('SWEEP', 'REFILL');

-- CreateEnum
CREATE TYPE "TreasuryTransferStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'BROADCAST', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "treasury_transfers" (
    "id" UUID NOT NULL,
    "type" "TreasuryTransferType" NOT NULL,
    "chain" CITEXT NOT NULL,
    "asset" CITEXT NOT NULL,
    "from_wallet_id" UUID NOT NULL,
    "to_wallet_id" UUID NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "status" "TreasuryTransferStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reason" TEXT,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_by_2" UUID,
    "rejected_by" UUID,
    "ledger_txn_id" UUID,
    "tx_hash" TEXT,
    "nonce" BIGINT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasury_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treasury_transfers_status_idx" ON "treasury_transfers"("status");

-- CreateIndex
CREATE INDEX "treasury_transfers_type_status_idx" ON "treasury_transfers"("type", "status");

-- CreateIndex
CREATE INDEX "treasury_transfers_chain_asset_idx" ON "treasury_transfers"("chain", "asset");

-- CreateIndex
CREATE INDEX "treasury_transfers_created_at_idx" ON "treasury_transfers"("created_at");

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_asset_fkey" FOREIGN KEY ("asset") REFERENCES "assets"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_from_wallet_id_fkey" FOREIGN KEY ("from_wallet_id") REFERENCES "hot_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_to_wallet_id_fkey" FOREIGN KEY ("to_wallet_id") REFERENCES "hot_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_approved_by_2_fkey" FOREIGN KEY ("approved_by_2") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_ledger_txn_id_fkey" FOREIGN KEY ("ledger_txn_id") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
