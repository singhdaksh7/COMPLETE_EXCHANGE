-- Stage 12 — Master-wallet USDT deposits V1 (deposit-only, manual tx-hash)
--
-- Additive only: 2 new tables (deposit_network_configs, master_wallet_deposits)
-- and 1 new enum (MasterWalletDepositStatus). No existing table is altered and
-- no constraint is relaxed. This flow is intentionally separate from the
-- scanner-based custody tables (crypto_deposits / deposit_addresses / sweeps).
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as the rest of the schema):
--   * enum created via DO/EXCEPTION duplicate_object guard
--   * CREATE TABLE IF NOT EXISTS with only the id PK
--   * columns via ADD COLUMN IF NOT EXISTS, then NOT NULL
--   * CREATE [UNIQUE] INDEX IF NOT EXISTS
--   * FK constraints wrapped in DO/EXCEPTION duplicate_object

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "MasterWalletDepositStatus" AS ENUM (
    'SUBMITTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'DUPLICATE', 'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- deposit_network_configs — public per-chain master receiving config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "deposit_network_configs" (
  "id" UUID NOT NULL,
  CONSTRAINT "deposit_network_configs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "deposit_network_configs" ADD COLUMN IF NOT EXISTS "asset_symbol" CITEXT;
ALTER TABLE "deposit_network_configs" ADD COLUMN IF NOT EXISTS "chain" CITEXT;
ALTER TABLE "deposit_network_configs" ADD COLUMN IF NOT EXISTS "network_name" TEXT;
ALTER TABLE "deposit_network_configs" ADD COLUMN IF NOT EXISTS "master_address" TEXT;
ALTER TABLE "deposit_network_configs" ADD COLUMN IF NOT EXISTS "token_contract" TEXT;
ALTER TABLE "deposit_network_configs" ADD COLUMN IF NOT EXISTS "decimals" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "deposit_network_configs" ADD COLUMN IF NOT EXISTS "min_confirmations" INTEGER;
ALTER TABLE "deposit_network_configs" ADD COLUMN IF NOT EXISTS "is_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "deposit_network_configs" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "deposit_network_configs" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "deposit_network_configs" ALTER COLUMN "asset_symbol" SET NOT NULL;
ALTER TABLE "deposit_network_configs" ALTER COLUMN "chain" SET NOT NULL;
ALTER TABLE "deposit_network_configs" ALTER COLUMN "network_name" SET NOT NULL;
ALTER TABLE "deposit_network_configs" ALTER COLUMN "min_confirmations" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "deposit_network_configs_asset_symbol_chain_key"
  ON "deposit_network_configs" ("asset_symbol", "chain");
CREATE INDEX IF NOT EXISTS "deposit_network_configs_chain_idx"
  ON "deposit_network_configs" ("chain");

-- ---------------------------------------------------------------------------
-- master_wallet_deposits — one row per submitted deposit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "master_wallet_deposits" (
  "id" UUID NOT NULL,
  CONSTRAINT "master_wallet_deposits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "asset_symbol" CITEXT;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "chain" CITEXT;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "master_address" TEXT;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "from_address" TEXT;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "tx_hash" TEXT;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "log_index" INTEGER;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(38,18) NOT NULL DEFAULT 0;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "confirmations" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "status" "MasterWalletDepositStatus" NOT NULL DEFAULT 'SUBMITTED';
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "raw_verification_summary" JSONB;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "credited_ledger_txn_id" UUID;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "credited_at" TIMESTAMP(3);
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "master_wallet_deposits" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "master_wallet_deposits" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "master_wallet_deposits" ALTER COLUMN "asset_symbol" SET NOT NULL;
ALTER TABLE "master_wallet_deposits" ALTER COLUMN "chain" SET NOT NULL;
ALTER TABLE "master_wallet_deposits" ALTER COLUMN "master_address" SET NOT NULL;
ALTER TABLE "master_wallet_deposits" ALTER COLUMN "tx_hash" SET NOT NULL;

-- Idempotency guard: at most one deposit row per (chain, txHash).
CREATE UNIQUE INDEX IF NOT EXISTS "master_wallet_deposits_chain_tx_hash_key"
  ON "master_wallet_deposits" ("chain", "tx_hash");
CREATE INDEX IF NOT EXISTS "master_wallet_deposits_user_id_idx"
  ON "master_wallet_deposits" ("user_id");
CREATE INDEX IF NOT EXISTS "master_wallet_deposits_status_idx"
  ON "master_wallet_deposits" ("status");
CREATE INDEX IF NOT EXISTS "master_wallet_deposits_chain_status_idx"
  ON "master_wallet_deposits" ("chain", "status");

DO $$ BEGIN
  ALTER TABLE "master_wallet_deposits"
    ADD CONSTRAINT "master_wallet_deposits_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
