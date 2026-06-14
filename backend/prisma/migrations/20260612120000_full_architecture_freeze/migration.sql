-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'FROZEN', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycDocType" AS ENUM ('PAN', 'AADHAAR', 'PASSPORT', 'SELFIE', 'ADDRESS_PROOF');

-- CreateEnum
CREATE TYPE "ChainFamily" AS ENUM ('EVM', 'TRON');

-- CreateEnum
CREATE TYPE "WalletTier" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('USER_AVAILABLE', 'USER_LOCKED', 'FEE_REVENUE', 'TDS_PAYABLE', 'HOT_WALLET', 'COLD_WALLET', 'GATEWAY_CLEARING', 'SWEEP_CLEARING', 'LIQUIDITY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EntryDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('DETECTED', 'CONFIRMING', 'CONFIRMED', 'CREDITED', 'ORPHANED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'RISK_CHECK', 'PENDING_APPROVAL', 'APPROVED', 'QUEUED', 'SIGNING', 'BROADCAST', 'CONFIRMING', 'COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SweepStatus" AS ENUM ('PENDING', 'SIGNING', 'BROADCAST', 'CONFIRMING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "InrTxnStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "InrTxnType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "ConversionSide" AS ENUM ('INR_TO_USDT', 'USDT_TO_INR');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('LIMIT', 'MARKET', 'STOP_LIMIT');

-- CreateEnum
CREATE TYPE "TimeInForce" AS ENUM ('GTC', 'IOC', 'FOK', 'POST_ONLY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('USER', 'KUCOIN_HEDGE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('ACTIVE', 'HALTED', 'POST_ONLY');

-- CreateEnum
CREATE TYPE "CandleInterval" AS ENUM ('M1', 'M5', 'M15', 'H1', 'H4', 'D1', 'W1');

-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('WITHDRAWAL', 'SWEEP');

-- CreateEnum
CREATE TYPE "ReconType" AS ENUM ('CHAIN', 'GATEWAY', 'LEDGER_INVARIANT');

-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('RUNNING', 'BALANCED', 'DISCREPANCY', 'FAILED');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('FIAT', 'CRYPTO');

-- CreateTable
CREATE TABLE "chains" (
    "id" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" "ChainFamily" NOT NULL,
    "native_asset" CITEXT NOT NULL,
    "evm_chain_id" INTEGER,
    "confirmations" INTEGER NOT NULL DEFAULT 12,
    "reorg_buffer" INTEGER NOT NULL DEFAULT 64,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "symbol" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "decimals" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "asset_chains" (
    "asset" CITEXT NOT NULL,
    "chain" CITEXT NOT NULL,
    "contract_addr" TEXT,
    "decimals" INTEGER NOT NULL,
    "min_confirmations" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "asset_chains_pkey" PRIMARY KEY ("asset","chain")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "base_asset" CITEXT NOT NULL,
    "quote_asset" CITEXT NOT NULL,
    "status" "MarketStatus" NOT NULL DEFAULT 'ACTIVE',
    "tick_size" DECIMAL(38,18) NOT NULL,
    "step_size" DECIMAL(38,18) NOT NULL,
    "min_notional" DECIMAL(38,18) NOT NULL,
    "maker_fee_bps" INTEGER NOT NULL,
    "taker_fee_bps" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMP(3),
    "phone_verified_at" TIMESTAMP(3),
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "kyc_tier" INTEGER NOT NULL DEFAULT 0,
    "totp_secret_enc" BYTEA,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "referral_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "device_info" JSONB,
    "ip" INET,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "totp_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "totp_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "email" CITEXT,
    "ip" INET,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RoleScope" NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "admin_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("admin_id","role_id")
);

-- CreateTable
CREATE TABLE "kyc_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "dob" DATE,
    "pan_enc" BYTEA,
    "aadhaar_ref_enc" BYTEA,
    "address" JSONB,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "provider_ref" TEXT,
    "rejected_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "doc_type" "KycDocType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "user_id" UUID,
    "asset" CITEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_balances" (
    "account_id" UUID NOT NULL,
    "balance" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "version" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_balances_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "txn_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "direction" "EntryDirection" NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "asset" CITEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id","created_at")
);

-- CreateTable
CREATE TABLE "deposit_addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chain" CITEXT NOT NULL,
    "address" TEXT NOT NULL,
    "derivation_index" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chain" CITEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "whitelisted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "withdrawal_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_signers" (
    "id" UUID NOT NULL,
    "chain" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kms_key_ref" TEXT NOT NULL,
    "public_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hot_wallets" (
    "id" UUID NOT NULL,
    "chain" CITEXT NOT NULL,
    "signer_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "tier" "WalletTier" NOT NULL DEFAULT 'HOT',
    "label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hot_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_nonces" (
    "hot_wallet_id" UUID NOT NULL,
    "next_nonce" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_nonces_pkey" PRIMARY KEY ("hot_wallet_id")
);

-- CreateTable
CREATE TABLE "crypto_deposits" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "address_id" UUID,
    "chain" CITEXT NOT NULL,
    "asset" CITEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "log_index" INTEGER NOT NULL DEFAULT 0,
    "from_address" TEXT,
    "amount_base" DECIMAL(78,0) NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "req_confirmations" INTEGER NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'DETECTED',
    "block_number" BIGINT,
    "block_hash" TEXT,
    "credited_txn_id" UUID,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credited_at" TIMESTAMP(3),

    CONSTRAINT "crypto_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_cursors" (
    "chain" CITEXT NOT NULL,
    "last_scanned_block" BIGINT NOT NULL,
    "last_scanned_hash" TEXT,
    "safe_block" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_cursors_pkey" PRIMARY KEY ("chain")
);

-- CreateTable
CREATE TABLE "sweeps" (
    "id" UUID NOT NULL,
    "chain" CITEXT NOT NULL,
    "asset" CITEXT NOT NULL,
    "from_address_id" UUID,
    "from_address" TEXT NOT NULL,
    "to_hot_wallet_id" UUID NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "amount_base" DECIMAL(78,0) NOT NULL,
    "status" "SweepStatus" NOT NULL DEFAULT 'PENDING',
    "tx_hash" TEXT,
    "nonce" BIGINT,
    "block_number" BIGINT,
    "block_hash" TEXT,
    "ledger_txn_id" UUID,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sweeps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_withdrawals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chain" CITEXT NOT NULL,
    "asset" CITEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "from_address" TEXT,
    "hot_wallet_id" UUID,
    "amount" DECIMAL(38,18) NOT NULL,
    "fee" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "tds_amount" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(38,18) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "hold_txn_id" UUID,
    "final_txn_id" UUID,
    "tx_hash" TEXT,
    "nonce" BIGINT,
    "approved_by" UUID,
    "approved_by_2" UUID,
    "approver_sig" TEXT,
    "risk_flags" JSONB,
    "failure_reason" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "broadcast_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crypto_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gas_reserves" (
    "id" UUID NOT NULL,
    "chain" CITEXT NOT NULL,
    "hot_wallet_id" UUID,
    "asset" CITEXT NOT NULL,
    "balance_base" DECIMAL(78,0) NOT NULL,
    "low_watermark_base" DECIMAL(78,0),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gas_reserves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_fees" (
    "id" UUID NOT NULL,
    "chain" CITEXT NOT NULL,
    "asset" CITEXT NOT NULL,
    "fee_kind" "FeeKind" NOT NULL,
    "withdrawal_id" UUID,
    "sweep_id" UUID,
    "tx_hash" TEXT,
    "gas_used" BIGINT,
    "gas_price_base" DECIMAL(78,0),
    "fee_base" DECIMAL(78,0) NOT NULL,
    "fee_asset" DECIMAL(38,18) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inr_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "InrTxnType" NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "fee" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" "InrTxnStatus" NOT NULL DEFAULT 'INITIATED',
    "provider" TEXT,
    "provider_order_id" TEXT,
    "provider_payment_id" TEXT,
    "bank_ref" TEXT,
    "ledger_txn_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inr_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "signature_ok" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_number_enc" BYTEA NOT NULL,
    "ifsc" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_quotes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "side" "ConversionSide" NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "spread_bps" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "quote_id" UUID,
    "side" "ConversionSide" NOT NULL,
    "inr_amount" DECIMAL(20,2) NOT NULL,
    "usdt_amount" DECIMAL(38,6) NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "fee_inr" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tds_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "ledger_txn_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "client_order_id" TEXT,
    "side" "OrderSide" NOT NULL,
    "type" "OrderType" NOT NULL,
    "tif" "TimeInForce" NOT NULL DEFAULT 'GTC',
    "price" DECIMAL(38,18),
    "stop_price" DECIMAL(38,18),
    "quantity" DECIMAL(38,18),
    "quote_budget" DECIMAL(38,18),
    "filled_quantity" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "quote_spent" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "locked_amount" DECIMAL(38,18),
    "locked_asset" CITEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "lock_txn_id" UUID,
    "source" "OrderSource" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" UUID NOT NULL,
    "fill_id" TEXT NOT NULL,
    "market_id" UUID NOT NULL,
    "maker_order_id" UUID NOT NULL,
    "taker_order_id" UUID NOT NULL,
    "maker_user_id" UUID NOT NULL,
    "taker_user_id" UUID NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "quote_amount" DECIMAL(38,18) NOT NULL,
    "maker_fee" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "taker_fee" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "maker_side" "OrderSide" NOT NULL,
    "settle_txn_id" UUID,
    "seq" BIGSERIAL NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id","executed_at")
);

-- CreateTable
CREATE TABLE "candles" (
    "market_id" UUID NOT NULL,
    "interval" "CandleInterval" NOT NULL,
    "open_time" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(38,18) NOT NULL,
    "high" DECIMAL(38,18) NOT NULL,
    "low" DECIMAL(38,18) NOT NULL,
    "close" DECIMAL(38,18) NOT NULL,
    "base_volume" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "quote_volume" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "trade_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "candles_pkey" PRIMARY KEY ("market_id","interval","open_time")
);

-- CreateTable
CREATE TABLE "market_tickers" (
    "market_id" UUID NOT NULL,
    "last_price" DECIMAL(38,18),
    "best_bid" DECIMAL(38,18),
    "best_ask" DECIMAL(38,18),
    "high_24h" DECIMAL(38,18),
    "low_24h" DECIMAL(38,18),
    "open_24h" DECIMAL(38,18),
    "base_volume_24h" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "quote_volume_24h" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "price_change_pct" DECIMAL(10,4),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_tickers_pkey" PRIMARY KEY ("market_id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" UUID NOT NULL,
    "type" "ReconType" NOT NULL,
    "scope" TEXT,
    "status" "ReconStatus" NOT NULL DEFAULT 'RUNNING',
    "expected" DECIMAL(38,18),
    "actual" DECIMAL(38,18),
    "diff" DECIMAL(38,18),
    "details" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "account_id" UUID NOT NULL,
    "recon_run_id" UUID,
    "balance" DECIMAL(38,18) NOT NULL,
    "entry_hwm" BIGINT,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_snapshots_pkey" PRIMARY KEY ("id","taken_at")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret_enc" BYTEA NOT NULL,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "ip" INET,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_logs" (
    "id" BIGSERIAL NOT NULL,
    "admin_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "reason" TEXT,
    "before_state" JSONB,
    "after_state" JSONB,
    "ip" INET,
    "request_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id","occurred_at")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "before_state" JSONB,
    "after_state" JSONB,
    "ip" INET,
    "user_agent" TEXT,
    "request_id" TEXT,
    "prev_hash" TEXT,
    "row_hash" TEXT,
    "metadata" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id","occurred_at")
);

-- CreateTable
CREATE TABLE "tier_limits" (
    "kyc_tier" INTEGER NOT NULL,
    "inr_daily_deposit" DECIMAL(20,2),
    "inr_daily_withdrawal" DECIMAL(20,2),
    "usdt_daily_withdrawal" DECIMAL(38,6),

    CONSTRAINT "tier_limits_pkey" PRIMARY KEY ("kyc_tier")
);

-- CreateTable
CREATE TABLE "system_flags" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chains_is_active_idx" ON "chains"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "markets_symbol_key" ON "markets"("symbol");

-- CreateIndex
CREATE INDEX "markets_status_idx" ON "markets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "markets_base_asset_quote_asset_key" ON "markets"("base_asset", "quote_asset");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_kyc_status_idx" ON "users"("kyc_status");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_family_id_idx" ON "auth_sessions"("family_id");

-- CreateIndex
CREATE INDEX "auth_sessions_refresh_hash_idx" ON "auth_sessions"("refresh_hash");

-- CreateIndex
CREATE INDEX "totp_recovery_codes_user_id_idx" ON "totp_recovery_codes"("user_id");

-- CreateIndex
CREATE INDEX "login_attempts_email_created_at_idx" ON "login_attempts"("email", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_created_at_idx" ON "login_attempts"("ip", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "roles_scope_idx" ON "roles"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "admin_roles_role_id_idx" ON "admin_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_profiles_user_id_key" ON "kyc_profiles"("user_id");

-- CreateIndex
CREATE INDEX "kyc_profiles_status_idx" ON "kyc_profiles"("status");

-- CreateIndex
CREATE INDEX "kyc_documents_user_id_idx" ON "kyc_documents"("user_id");

-- CreateIndex
CREATE INDEX "kyc_documents_status_idx" ON "kyc_documents"("status");

-- CreateIndex
CREATE INDEX "accounts_kind_asset_idx" ON "accounts"("kind", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_asset_kind_key" ON "accounts"("user_id", "asset", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_id_asset_key" ON "accounts"("id", "asset");

-- CreateIndex
CREATE INDEX "ledger_transactions_reference_type_reference_id_idx" ON "ledger_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "ledger_transactions_kind_created_at_idx" ON "ledger_transactions"("kind", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_created_at_idx" ON "ledger_entries"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_txn_id_idx" ON "ledger_entries"("txn_id");

-- CreateIndex
CREATE INDEX "deposit_addresses_user_id_chain_idx" ON "deposit_addresses"("user_id", "chain");

-- CreateIndex
CREATE INDEX "deposit_addresses_address_idx" ON "deposit_addresses"("address");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_addresses_chain_address_key" ON "deposit_addresses"("chain", "address");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_addresses_chain_derivation_index_key" ON "deposit_addresses"("chain", "derivation_index");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_addresses_user_id_chain_address_key" ON "withdrawal_addresses"("user_id", "chain", "address");

-- CreateIndex
CREATE INDEX "chain_signers_chain_status_idx" ON "chain_signers"("chain", "status");

-- CreateIndex
CREATE UNIQUE INDEX "chain_signers_chain_kms_key_ref_key" ON "chain_signers"("chain", "kms_key_ref");

-- CreateIndex
CREATE INDEX "hot_wallets_chain_tier_is_active_idx" ON "hot_wallets"("chain", "tier", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "hot_wallets_chain_address_key" ON "hot_wallets"("chain", "address");

-- CreateIndex
CREATE INDEX "crypto_deposits_status_idx" ON "crypto_deposits"("status");

-- CreateIndex
CREATE INDEX "crypto_deposits_user_id_idx" ON "crypto_deposits"("user_id");

-- CreateIndex
CREATE INDEX "crypto_deposits_chain_block_number_idx" ON "crypto_deposits"("chain", "block_number");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_deposits_chain_tx_hash_log_index_key" ON "crypto_deposits"("chain", "tx_hash", "log_index");

-- CreateIndex
CREATE INDEX "sweeps_status_idx" ON "sweeps"("status");

-- CreateIndex
CREATE INDEX "sweeps_to_hot_wallet_id_idx" ON "sweeps"("to_hot_wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "sweeps_chain_tx_hash_key" ON "sweeps"("chain", "tx_hash");

-- CreateIndex
CREATE INDEX "crypto_withdrawals_status_idx" ON "crypto_withdrawals"("status");

-- CreateIndex
CREATE INDEX "crypto_withdrawals_user_id_idx" ON "crypto_withdrawals"("user_id");

-- CreateIndex
CREATE INDEX "crypto_withdrawals_tx_hash_idx" ON "crypto_withdrawals"("tx_hash");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_withdrawals_chain_from_address_nonce_key" ON "crypto_withdrawals"("chain", "from_address", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "gas_reserves_chain_hot_wallet_id_asset_key" ON "gas_reserves"("chain", "hot_wallet_id", "asset");

-- CreateIndex
CREATE INDEX "network_fees_chain_created_at_idx" ON "network_fees"("chain", "created_at");

-- CreateIndex
CREATE INDEX "network_fees_withdrawal_id_idx" ON "network_fees"("withdrawal_id");

-- CreateIndex
CREATE INDEX "network_fees_sweep_id_idx" ON "network_fees"("sweep_id");

-- CreateIndex
CREATE INDEX "inr_transactions_user_id_type_idx" ON "inr_transactions"("user_id", "type");

-- CreateIndex
CREATE INDEX "inr_transactions_status_idx" ON "inr_transactions"("status");

-- CreateIndex
CREATE INDEX "inr_transactions_provider_provider_order_id_idx" ON "inr_transactions"("provider", "provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "inr_transactions_provider_provider_payment_id_key" ON "inr_transactions"("provider", "provider_payment_id");

-- CreateIndex
CREATE INDEX "payment_webhook_events_processed_at_idx" ON "payment_webhook_events"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_provider_event_id_key" ON "payment_webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "bank_accounts_user_id_idx" ON "bank_accounts"("user_id");

-- CreateIndex
CREATE INDEX "price_quotes_user_id_idx" ON "price_quotes"("user_id");

-- CreateIndex
CREATE INDEX "price_quotes_expires_at_idx" ON "price_quotes"("expires_at");

-- CreateIndex
CREATE INDEX "conversions_user_id_created_at_idx" ON "conversions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_market_id_status_idx" ON "orders"("market_id", "status");

-- CreateIndex
CREATE INDEX "orders_market_id_type_status_idx" ON "orders"("market_id", "type", "status");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_user_id_client_order_id_key" ON "orders"("user_id", "client_order_id");

-- CreateIndex
CREATE INDEX "trades_market_id_executed_at_idx" ON "trades"("market_id", "executed_at");

-- CreateIndex
CREATE INDEX "trades_maker_user_id_executed_at_idx" ON "trades"("maker_user_id", "executed_at");

-- CreateIndex
CREATE INDEX "trades_taker_user_id_executed_at_idx" ON "trades"("taker_user_id", "executed_at");

-- CreateIndex
CREATE INDEX "trades_maker_order_id_idx" ON "trades"("maker_order_id");

-- CreateIndex
CREATE INDEX "trades_taker_order_id_idx" ON "trades"("taker_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "trades_fill_id_key" ON "trades"("fill_id");

-- CreateIndex
CREATE INDEX "candles_market_id_interval_open_time_idx" ON "candles"("market_id", "interval", "open_time" DESC);

-- CreateIndex
CREATE INDEX "reconciliation_runs_type_started_at_idx" ON "reconciliation_runs"("type", "started_at");

-- CreateIndex
CREATE INDEX "reconciliation_runs_status_idx" ON "reconciliation_runs"("status");

-- CreateIndex
CREATE INDEX "balance_snapshots_account_id_taken_at_idx" ON "balance_snapshots"("account_id", "taken_at");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions"("admin_id");

-- CreateIndex
CREATE INDEX "admin_logs_admin_id_occurred_at_idx" ON "admin_logs"("admin_id", "occurred_at");

-- CreateIndex
CREATE INDEX "admin_logs_target_type_target_id_idx" ON "admin_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "admin_logs_action_occurred_at_idx" ON "admin_logs"("action", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_type_actor_id_idx" ON "audit_logs"("actor_type", "actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_occurred_at_idx" ON "audit_logs"("action", "occurred_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_endpoint_key_key" ON "idempotency_keys"("user_id", "endpoint", "key");

-- AddForeignKey
ALTER TABLE "chains" ADD CONSTRAINT "chains_native_asset_fkey" FOREIGN KEY ("native_asset") REFERENCES "assets"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_chains" ADD CONSTRAINT "asset_chains_asset_fkey" FOREIGN KEY ("asset") REFERENCES "assets"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_chains" ADD CONSTRAINT "asset_chains_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_base_asset_fkey" FOREIGN KEY ("base_asset") REFERENCES "assets"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_quote_asset_fkey" FOREIGN KEY ("quote_asset") REFERENCES "assets"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "totp_recovery_codes" ADD CONSTRAINT "totp_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_asset_fkey" FOREIGN KEY ("asset") REFERENCES "assets"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_txn_id_fkey" FOREIGN KEY ("txn_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_asset_fkey" FOREIGN KEY ("account_id", "asset") REFERENCES "accounts"("id", "asset") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_asset_fkey" FOREIGN KEY ("asset") REFERENCES "assets"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_addresses" ADD CONSTRAINT "deposit_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_addresses" ADD CONSTRAINT "deposit_addresses_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_addresses" ADD CONSTRAINT "withdrawal_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_addresses" ADD CONSTRAINT "withdrawal_addresses_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_signers" ADD CONSTRAINT "chain_signers_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_wallets" ADD CONSTRAINT "hot_wallets_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_wallets" ADD CONSTRAINT "hot_wallets_signer_id_fkey" FOREIGN KEY ("signer_id") REFERENCES "chain_signers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_nonces" ADD CONSTRAINT "wallet_nonces_hot_wallet_id_fkey" FOREIGN KEY ("hot_wallet_id") REFERENCES "hot_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_deposits" ADD CONSTRAINT "crypto_deposits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_deposits" ADD CONSTRAINT "crypto_deposits_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "deposit_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_deposits" ADD CONSTRAINT "crypto_deposits_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_deposits" ADD CONSTRAINT "crypto_deposits_credited_txn_id_fkey" FOREIGN KEY ("credited_txn_id") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_cursors" ADD CONSTRAINT "chain_cursors_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sweeps" ADD CONSTRAINT "sweeps_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sweeps" ADD CONSTRAINT "sweeps_from_address_id_fkey" FOREIGN KEY ("from_address_id") REFERENCES "deposit_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sweeps" ADD CONSTRAINT "sweeps_to_hot_wallet_id_fkey" FOREIGN KEY ("to_hot_wallet_id") REFERENCES "hot_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sweeps" ADD CONSTRAINT "sweeps_ledger_txn_id_fkey" FOREIGN KEY ("ledger_txn_id") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_withdrawals" ADD CONSTRAINT "crypto_withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_withdrawals" ADD CONSTRAINT "crypto_withdrawals_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_withdrawals" ADD CONSTRAINT "crypto_withdrawals_hot_wallet_id_fkey" FOREIGN KEY ("hot_wallet_id") REFERENCES "hot_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_withdrawals" ADD CONSTRAINT "crypto_withdrawals_hold_txn_id_fkey" FOREIGN KEY ("hold_txn_id") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_withdrawals" ADD CONSTRAINT "crypto_withdrawals_final_txn_id_fkey" FOREIGN KEY ("final_txn_id") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_withdrawals" ADD CONSTRAINT "crypto_withdrawals_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_withdrawals" ADD CONSTRAINT "crypto_withdrawals_approved_by_2_fkey" FOREIGN KEY ("approved_by_2") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gas_reserves" ADD CONSTRAINT "gas_reserves_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gas_reserves" ADD CONSTRAINT "gas_reserves_hot_wallet_id_fkey" FOREIGN KEY ("hot_wallet_id") REFERENCES "hot_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gas_reserves" ADD CONSTRAINT "gas_reserves_asset_fkey" FOREIGN KEY ("asset") REFERENCES "assets"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_fees" ADD CONSTRAINT "network_fees_chain_fkey" FOREIGN KEY ("chain") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_fees" ADD CONSTRAINT "network_fees_asset_fkey" FOREIGN KEY ("asset") REFERENCES "assets"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_fees" ADD CONSTRAINT "network_fees_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "crypto_withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_fees" ADD CONSTRAINT "network_fees_sweep_id_fkey" FOREIGN KEY ("sweep_id") REFERENCES "sweeps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inr_transactions" ADD CONSTRAINT "inr_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inr_transactions" ADD CONSTRAINT "inr_transactions_ledger_txn_id_fkey" FOREIGN KEY ("ledger_txn_id") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "price_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_ledger_txn_id_fkey" FOREIGN KEY ("ledger_txn_id") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_lock_txn_id_fkey" FOREIGN KEY ("lock_txn_id") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_maker_order_id_fkey" FOREIGN KEY ("maker_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_taker_order_id_fkey" FOREIGN KEY ("taker_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_maker_user_id_fkey" FOREIGN KEY ("maker_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_taker_user_id_fkey" FOREIGN KEY ("taker_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_settle_txn_id_fkey" FOREIGN KEY ("settle_txn_id") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candles" ADD CONSTRAINT "candles_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_tickers" ADD CONSTRAINT "market_tickers_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_recon_run_id_fkey" FOREIGN KEY ("recon_run_id") REFERENCES "reconciliation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_flags" ADD CONSTRAINT "system_flags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- RAW SQL — items Prisma cannot express (REV 2 / §R.7)
-- Applied in the same baseline migration. Tables are empty here, so partial
-- indexes are built non-CONCURRENTLY. For LIVE changes post-launch, rebuild
-- with CREATE INDEX CONCURRENTLY in a standalone (non-transactional) migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Partial UNIQUE / INDEX — replace the plain ones Prisma generated
-- ----------------------------------------------------------------------------

-- users: soft-delete frees the email (email is citext => case-insensitive)
DROP INDEX "users_email_key";
CREATE UNIQUE INDEX "users_email_active_key" ON "users"("email") WHERE "deleted_at" IS NULL;

-- crypto_withdrawals: nonce safety scoped to (chain, from_address) — C2
DROP INDEX "crypto_withdrawals_chain_from_address_nonce_key";
CREATE UNIQUE INDEX "crypto_withdrawals_chain_from_address_nonce_key"
  ON "crypto_withdrawals"("chain", "from_address", "nonce") WHERE "nonce" IS NOT NULL;
-- active-queue worker (skip terminal states)
DROP INDEX "crypto_withdrawals_status_idx";
CREATE INDEX "crypto_withdrawals_status_idx" ON "crypto_withdrawals"("status")
  WHERE "status" NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED');

-- deposit_addresses: one ACTIVE address per (user, chain) — allows rotation (H6)
CREATE UNIQUE INDEX "deposit_addresses_user_id_chain_active_key"
  ON "deposit_addresses"("user_id", "chain") WHERE "is_active";

-- withdrawal_addresses: soft-delete frees the allowlist slot
DROP INDEX "withdrawal_addresses_user_id_chain_address_key";
CREATE UNIQUE INDEX "withdrawal_addresses_user_id_chain_address_key"
  ON "withdrawal_addresses"("user_id", "chain", "address") WHERE "deleted_at" IS NULL;

-- sweeps: idempotent broadcast
DROP INDEX "sweeps_chain_tx_hash_key";
CREATE UNIQUE INDEX "sweeps_chain_tx_hash_key" ON "sweeps"("chain", "tx_hash") WHERE "tx_hash" IS NOT NULL;

-- orders: idempotent placement
DROP INDEX "orders_user_id_client_order_id_key";
CREATE UNIQUE INDEX "orders_user_id_client_order_id_key"
  ON "orders"("user_id", "client_order_id") WHERE "client_order_id" IS NOT NULL;
-- book rebuild / open orders (hottest read)
DROP INDEX "orders_market_id_status_idx";
CREATE INDEX "orders_market_id_status_idx" ON "orders"("market_id", "status")
  WHERE "status" IN ('OPEN', 'PARTIALLY_FILLED');
-- stop-order trigger monitor
DROP INDEX "orders_market_id_type_status_idx";
CREATE INDEX "orders_market_id_type_status_idx" ON "orders"("market_id", "status")
  WHERE "type" = 'STOP_LIMIT';

-- crypto_deposits: confirmation worker scan
DROP INDEX "crypto_deposits_status_idx";
CREATE INDEX "crypto_deposits_status_idx" ON "crypto_deposits"("status")
  WHERE "status" IN ('DETECTED', 'CONFIRMING');

-- auth_sessions: active sessions only
DROP INDEX "auth_sessions_user_id_idx";
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id") WHERE "revoked_at" IS NULL;

-- totp_recovery_codes: unused codes only
DROP INDEX "totp_recovery_codes_user_id_idx";
CREATE INDEX "totp_recovery_codes_user_id_idx" ON "totp_recovery_codes"("user_id") WHERE "used_at" IS NULL;

-- payment_webhook_events: unprocessed queue
DROP INDEX "payment_webhook_events_processed_at_idx";
CREATE INDEX "payment_webhook_events_processed_at_idx" ON "payment_webhook_events"("processed_at")
  WHERE "processed_at" IS NULL;

-- ----------------------------------------------------------------------------
-- 2. CHECK constraints (financial integrity / state-machine guards)
-- ----------------------------------------------------------------------------
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_kind_user_chk"
  CHECK (("kind" IN ('USER_AVAILABLE', 'USER_LOCKED')) = ("user_id" IS NOT NULL));
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "crypto_deposits" ADD CONSTRAINT "crypto_deposits_amount_chk" CHECK ("amount" > 0 AND "amount_base" > 0);
ALTER TABLE "crypto_withdrawals" ADD CONSTRAINT "crypto_withdrawals_net_chk" CHECK ("net_amount" = "amount" - "fee" - "tds_amount");
ALTER TABLE "crypto_withdrawals" ADD CONSTRAINT "crypto_withdrawals_dual_chk" CHECK ("approved_by" IS NULL OR "approved_by" <> "approved_by_2");
ALTER TABLE "inr_transactions" ADD CONSTRAINT "inr_transactions_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_amount_chk" CHECK ("inr_amount" > 0 AND "usdt_amount" > 0);
ALTER TABLE "trades" ADD CONSTRAINT "trades_qty_price_chk" CHECK ("quantity" > 0 AND "price" > 0);
ALTER TABLE "trades" ADD CONSTRAINT "trades_quote_chk" CHECK (abs("quote_amount" - "price" * "quantity") <= 1e-12);
ALTER TABLE "orders" ADD CONSTRAINT "orders_filled_chk" CHECK ("quantity" IS NULL OR "filled_quantity" <= "quantity");
ALTER TABLE "orders" ADD CONSTRAINT "orders_limit_price_chk" CHECK ("type" <> 'LIMIT' OR "price" IS NOT NULL);
ALTER TABLE "orders" ADD CONSTRAINT "orders_stop_price_chk" CHECK ("type" <> 'STOP_LIMIT' OR "stop_price" IS NOT NULL);
ALTER TABLE "orders" ADD CONSTRAINT "orders_market_lock_chk" CHECK ("type" <> 'MARKET' OR "quantity" IS NOT NULL OR "quote_budget" IS NOT NULL);
-- account_balances.balance >= 0 for user-kind accounts is enforced by the
-- balance-update trigger (system clearing accounts may swing negative intra-txn).

-- ----------------------------------------------------------------------------
-- 3. Double-entry invariant — per (txn, asset) sum-to-zero (deferred to commit)
-- ----------------------------------------------------------------------------
-- Row-level deferred constraint trigger: at COMMIT, the inserted entry's txn
-- must net to zero for every asset. (Constraint triggers must be FOR EACH ROW
-- and cannot use REFERENCING transition tables.) Re-checking per row is cheap
-- and idempotent; the txn commits only if balanced.
CREATE OR REPLACE FUNCTION assert_ledger_balanced() RETURNS trigger AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ledger_entries" le
    WHERE le.txn_id = NEW.txn_id
    GROUP BY le.asset
    HAVING SUM(CASE le.direction WHEN 'CREDIT' THEN le.amount ELSE -le.amount END) <> 0
  ) THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced (per-asset sum <> 0)', NEW.txn_id;
  END IF;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_balanced();

-- ----------------------------------------------------------------------------
-- 4. Append-only enforcement (immutable tables) — block UPDATE/DELETE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'table % is append-only; UPDATE/DELETE rejected', TG_TABLE_NAME;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER trades_append_only BEFORE UPDATE OR DELETE ON "trades" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER admin_logs_append_only BEFORE UPDATE OR DELETE ON "admin_logs" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER balance_snapshots_append_only BEFORE UPDATE OR DELETE ON "balance_snapshots" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER webhook_events_append_only BEFORE UPDATE OR DELETE ON "payment_webhook_events" FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- NOTE: partitioning (RANGE on ledger_entries.created_at, trades.executed_at,
--       audit_logs/admin_logs.occurred_at, balance_snapshots.taken_at) is DEFERRED
--       per §6 until volume warrants it; composite PKs already include the future
--       partition key, so conversion is non-breaking.
