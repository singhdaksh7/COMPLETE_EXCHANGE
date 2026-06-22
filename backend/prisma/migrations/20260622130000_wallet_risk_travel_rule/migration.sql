-- Stage 5.3 — Wallet Risk + Travel Rule Foundation
--
-- Additive only: four new enums, five new tables (wallet_risk_profiles,
-- wallet_risk_checks, wallet_risk_events, travel_rule_counterparties,
-- travel_rule_transfers) plus one new value on the existing ComplianceAlertType
-- enum. No existing table is altered, rewritten, or deleted; nothing here
-- touches the ledger, scanner, matching engine, or withdrawal signing. Records
-- are never auto-deleted.
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as the Stage 5.2 migration):
--   * enum create wrapped in DO/EXCEPTION duplicate_object
--   * enum value add via ADD VALUE IF NOT EXISTS
--   * CREATE TABLE IF NOT EXISTS with only the id PK
--   * columns via ADD COLUMN IF NOT EXISTS, then defaults, then NOT NULL
--   * CREATE [UNIQUE] INDEX IF NOT EXISTS
--   * FK constraints wrapped in DO/EXCEPTION duplicate_object

-- ===========================================================================
-- 1. Enums
-- ===========================================================================
DO $$ BEGIN
  CREATE TYPE "WalletRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "WalletRiskStatus" AS ENUM ('CLEAR', 'REVIEW_REQUIRED', 'BLOCKED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TravelRuleStatus" AS ENUM ('NOT_REQUIRED', 'REQUIRED', 'PENDING_INFO', 'READY', 'SENT_MOCK', 'FAILED', 'EXEMPTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TravelRuleDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- New ComplianceAlertType value so wallet-risk alerts reuse the Stage 5.2 model.
ALTER TYPE "ComplianceAlertType" ADD VALUE IF NOT EXISTS 'WALLET_RISK_ACTIVITY';

-- ===========================================================================
-- 2. wallet_risk_profiles
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "wallet_risk_profiles" (
  "id" UUID NOT NULL,
  CONSTRAINT "wallet_risk_profiles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "chain" CITEXT;
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "level" "WalletRiskLevel";
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "status" "WalletRiskStatus";
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "score" INTEGER;
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "check_count" INTEGER;
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "categories" JSONB;
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "overridden_level" "WalletRiskLevel";
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "overridden_by_admin_id" UUID;
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "last_check_id" UUID;
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "first_seen_at" TIMESTAMP(3);
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "last_screened_at" TIMESTAMP(3);
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "wallet_risk_profiles" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "level" SET DEFAULT 'LOW';
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "status" SET DEFAULT 'CLEAR';
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "score" SET DEFAULT 0;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "check_count" SET DEFAULT 0;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "first_seen_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "chain" SET NOT NULL;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "address" SET NOT NULL;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "level" SET NOT NULL;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "score" SET NOT NULL;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "check_count" SET NOT NULL;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "first_seen_at" SET NOT NULL;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "wallet_risk_profiles" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_risk_profiles_chain_address_key" ON "wallet_risk_profiles"("chain", "address");
CREATE INDEX IF NOT EXISTS "wallet_risk_profiles_level_idx" ON "wallet_risk_profiles"("level");
CREATE INDEX IF NOT EXISTS "wallet_risk_profiles_status_idx" ON "wallet_risk_profiles"("status");

-- ===========================================================================
-- 3. wallet_risk_checks
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "wallet_risk_checks" (
  "id" UUID NOT NULL,
  CONSTRAINT "wallet_risk_checks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "profile_id" UUID;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "chain" CITEXT;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "direction" "TravelRuleDirection";
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "level" "WalletRiskLevel";
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "status" "WalletRiskStatus";
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "provider_mode" TEXT;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "score" INTEGER;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "categories" JSONB;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "withdrawal_id" UUID;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "deposit_id" UUID;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "alert_id" UUID;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "case_id" UUID;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "review_decision" "WalletRiskStatus";
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "review_note" TEXT;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "reviewed_by_admin_id" UUID;
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "wallet_risk_checks" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

ALTER TABLE "wallet_risk_checks" ALTER COLUMN "level" SET DEFAULT 'LOW';
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "status" SET DEFAULT 'CLEAR';
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "score" SET DEFAULT 0;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "wallet_risk_checks" ALTER COLUMN "chain" SET NOT NULL;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "address" SET NOT NULL;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "level" SET NOT NULL;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "provider" SET NOT NULL;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "provider_mode" SET NOT NULL;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "score" SET NOT NULL;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "dedupe_key" SET NOT NULL;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "wallet_risk_checks" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_risk_checks_dedupe_key_key" ON "wallet_risk_checks"("dedupe_key");
CREATE INDEX IF NOT EXISTS "wallet_risk_checks_user_id_created_at_idx" ON "wallet_risk_checks"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "wallet_risk_checks_chain_address_idx" ON "wallet_risk_checks"("chain", "address");
CREATE INDEX IF NOT EXISTS "wallet_risk_checks_status_idx" ON "wallet_risk_checks"("status");
CREATE INDEX IF NOT EXISTS "wallet_risk_checks_level_idx" ON "wallet_risk_checks"("level");

DO $$ BEGIN
  ALTER TABLE "wallet_risk_checks" ADD CONSTRAINT "wallet_risk_checks_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "wallet_risk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "wallet_risk_checks" ADD CONSTRAINT "wallet_risk_checks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 4. wallet_risk_events
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "wallet_risk_events" (
  "id" UUID NOT NULL,
  CONSTRAINT "wallet_risk_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "wallet_risk_events" ADD COLUMN IF NOT EXISTS "profile_id" UUID;
ALTER TABLE "wallet_risk_events" ADD COLUMN IF NOT EXISTS "action" TEXT;
ALTER TABLE "wallet_risk_events" ADD COLUMN IF NOT EXISTS "actor_admin_id" UUID;
ALTER TABLE "wallet_risk_events" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "wallet_risk_events" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);

ALTER TABLE "wallet_risk_events" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "wallet_risk_events" ALTER COLUMN "profile_id" SET NOT NULL;
ALTER TABLE "wallet_risk_events" ALTER COLUMN "action" SET NOT NULL;
ALTER TABLE "wallet_risk_events" ALTER COLUMN "created_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "wallet_risk_events_profile_id_created_at_idx" ON "wallet_risk_events"("profile_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "wallet_risk_events" ADD CONSTRAINT "wallet_risk_events_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "wallet_risk_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 5. travel_rule_counterparties
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "travel_rule_counterparties" (
  "id" UUID NOT NULL,
  CONSTRAINT "travel_rule_counterparties_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "travel_rule_counterparties" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "travel_rule_counterparties" ADD COLUMN IF NOT EXISTS "vasp_code" TEXT;
ALTER TABLE "travel_rule_counterparties" ADD COLUMN IF NOT EXISTS "chain" CITEXT;
ALTER TABLE "travel_rule_counterparties" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "travel_rule_counterparties" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "travel_rule_counterparties" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "travel_rule_counterparties" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "travel_rule_counterparties" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

ALTER TABLE "travel_rule_counterparties" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "travel_rule_counterparties" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "travel_rule_counterparties" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "travel_rule_counterparties" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "travel_rule_counterparties" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "travel_rule_counterparties_name_idx" ON "travel_rule_counterparties"("name");

-- ===========================================================================
-- 6. travel_rule_transfers
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "travel_rule_transfers" (
  "id" UUID NOT NULL,
  CONSTRAINT "travel_rule_transfers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "direction" "TravelRuleDirection";
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "status" "TravelRuleStatus";
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "chain" CITEXT;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "asset" CITEXT;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(38,18);
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "threshold_amount" DECIMAL(38,18);
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "counterparty_address" TEXT;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "counterparty_id" UUID;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "originator_name" TEXT;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "beneficiary_name" TEXT;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "withdrawal_id" UUID;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "deposit_id" UUID;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "info_collected_at" TIMESTAMP(3);
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "sent_mock_at" TIMESTAMP(3);
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "exempted_reason" TEXT;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "reviewed_by_admin_id" UUID;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "travel_rule_transfers" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

ALTER TABLE "travel_rule_transfers" ALTER COLUMN "status" SET DEFAULT 'NOT_REQUIRED';
ALTER TABLE "travel_rule_transfers" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "travel_rule_transfers" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "travel_rule_transfers" ALTER COLUMN "direction" SET NOT NULL;
ALTER TABLE "travel_rule_transfers" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "travel_rule_transfers" ALTER COLUMN "chain" SET NOT NULL;
ALTER TABLE "travel_rule_transfers" ALTER COLUMN "asset" SET NOT NULL;
ALTER TABLE "travel_rule_transfers" ALTER COLUMN "amount" SET NOT NULL;
ALTER TABLE "travel_rule_transfers" ALTER COLUMN "dedupe_key" SET NOT NULL;
ALTER TABLE "travel_rule_transfers" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "travel_rule_transfers" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "travel_rule_transfers_dedupe_key_key" ON "travel_rule_transfers"("dedupe_key");
CREATE INDEX IF NOT EXISTS "travel_rule_transfers_status_idx" ON "travel_rule_transfers"("status");
CREATE INDEX IF NOT EXISTS "travel_rule_transfers_direction_idx" ON "travel_rule_transfers"("direction");
CREATE INDEX IF NOT EXISTS "travel_rule_transfers_user_id_created_at_idx" ON "travel_rule_transfers"("user_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "travel_rule_transfers" ADD CONSTRAINT "travel_rule_transfers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "travel_rule_transfers" ADD CONSTRAINT "travel_rule_transfers_counterparty_id_fkey"
    FOREIGN KEY ("counterparty_id") REFERENCES "travel_rule_counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
