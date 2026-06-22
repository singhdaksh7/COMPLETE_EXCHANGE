-- Stage 5.2 — Suspicious Transaction Monitoring + STR Case Workflow
--
-- Additive only: five new enums + four new tables (compliance_cases,
-- compliance_alerts, compliance_case_notes, compliance_case_events). No existing
-- table is altered, rewritten, or deleted. The monitoring engine READS
-- deposits / withdrawals / trades / inr_transactions but never mutates them.
--
-- IDEMPOTENT / REPAIR-SAFE: every statement can be re-run, and a partially
-- created database (some enums/tables/columns present, others missing) is healed
-- to the full target shape. Strategy:
--   * CREATE TYPE wrapped in DO/EXCEPTION duplicate_object
--   * CREATE TABLE IF NOT EXISTS with only the id PK
--   * each column added via ADD COLUMN IF NOT EXISTS (nullable first)
--   * defaults set, then NOT NULL applied (tables are empty in any partial state)
--   * CREATE [UNIQUE] INDEX IF NOT EXISTS
--   * FK constraints wrapped in DO/EXCEPTION duplicate_object

-- ===========================================================================
-- 1. Enums (idempotent)
-- ===========================================================================
DO $$ BEGIN
  CREATE TYPE "ComplianceAlertType" AS ENUM ('HIGH_VALUE_WITHDRAWAL', 'RAPID_DEPOSIT_WITHDRAWAL', 'STRUCTURING_PATTERN', 'ABNORMAL_TRADING_VOLUME', 'REPEATED_FAILED_WITHDRAWALS', 'HIGH_RISK_USER_ACTIVITY', 'SCREENING_RISK_ACTIVITY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceAlertStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'LINKED_TO_CASE', 'DISMISSED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceCaseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceCasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceCaseType" AS ENUM ('SUSPICIOUS_TRANSACTION', 'HIGH_RISK_USER', 'WALLET_RISK', 'SCREENING_MATCH', 'MANUAL_REVIEW');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 2. compliance_cases  (created before compliance_alerts: alerts FK -> cases)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_cases" (
  "id" UUID NOT NULL,
  CONSTRAINT "compliance_cases_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "type" "ComplianceCaseType";
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "status" "ComplianceCaseStatus";
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "priority" "ComplianceCasePriority";
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "assigned_to_admin_id" UUID;
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "opened_by_admin_id" UUID;
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "closed_by_admin_id" UUID;
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP(3);
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "compliance_cases" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

-- defaults (idempotent) then NOT NULL (tables are empty in any partial state)
ALTER TABLE "compliance_cases" ALTER COLUMN "type" SET DEFAULT 'SUSPICIOUS_TRANSACTION';
ALTER TABLE "compliance_cases" ALTER COLUMN "status" SET DEFAULT 'OPEN';
ALTER TABLE "compliance_cases" ALTER COLUMN "priority" SET DEFAULT 'MEDIUM';
ALTER TABLE "compliance_cases" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_cases" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "compliance_cases" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "compliance_cases" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "compliance_cases" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "compliance_cases" ALTER COLUMN "priority" SET NOT NULL;
ALTER TABLE "compliance_cases" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "compliance_cases" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "compliance_cases" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "compliance_cases_dedupe_key_key" ON "compliance_cases"("dedupe_key");
CREATE INDEX IF NOT EXISTS "compliance_cases_user_id_created_at_idx" ON "compliance_cases"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "compliance_cases_status_idx" ON "compliance_cases"("status");
CREATE INDEX IF NOT EXISTS "compliance_cases_priority_idx" ON "compliance_cases"("priority");
CREATE INDEX IF NOT EXISTS "compliance_cases_assigned_to_admin_id_idx" ON "compliance_cases"("assigned_to_admin_id");

DO $$ BEGIN
  ALTER TABLE "compliance_cases" ADD CONSTRAINT "compliance_cases_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 3. compliance_alerts
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_alerts" (
  "id" UUID NOT NULL,
  CONSTRAINT "compliance_alerts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "type" "ComplianceAlertType";
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "status" "ComplianceAlertStatus";
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "priority" "ComplianceCasePriority";
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "score" INTEGER;
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "details" JSONB;
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "case_id" UUID;
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "resolved_by_admin_id" UUID;
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(3);
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "compliance_alerts" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

ALTER TABLE "compliance_alerts" ALTER COLUMN "status" SET DEFAULT 'OPEN';
ALTER TABLE "compliance_alerts" ALTER COLUMN "priority" SET DEFAULT 'LOW';
ALTER TABLE "compliance_alerts" ALTER COLUMN "score" SET DEFAULT 0;
ALTER TABLE "compliance_alerts" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_alerts" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "compliance_alerts" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "compliance_alerts" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "compliance_alerts" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "compliance_alerts" ALTER COLUMN "priority" SET NOT NULL;
ALTER TABLE "compliance_alerts" ALTER COLUMN "score" SET NOT NULL;
ALTER TABLE "compliance_alerts" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "compliance_alerts" ALTER COLUMN "dedupe_key" SET NOT NULL;
ALTER TABLE "compliance_alerts" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "compliance_alerts" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "compliance_alerts_dedupe_key_key" ON "compliance_alerts"("dedupe_key");
CREATE INDEX IF NOT EXISTS "compliance_alerts_user_id_created_at_idx" ON "compliance_alerts"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "compliance_alerts_status_idx" ON "compliance_alerts"("status");
CREATE INDEX IF NOT EXISTS "compliance_alerts_type_idx" ON "compliance_alerts"("type");
CREATE INDEX IF NOT EXISTS "compliance_alerts_case_id_idx" ON "compliance_alerts"("case_id");

DO $$ BEGIN
  ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_case_id_fkey"
    FOREIGN KEY ("case_id") REFERENCES "compliance_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 4. compliance_case_notes
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_case_notes" (
  "id" UUID NOT NULL,
  CONSTRAINT "compliance_case_notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "compliance_case_notes" ADD COLUMN IF NOT EXISTS "case_id" UUID;
ALTER TABLE "compliance_case_notes" ADD COLUMN IF NOT EXISTS "admin_id" UUID;
ALTER TABLE "compliance_case_notes" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "compliance_case_notes" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);

ALTER TABLE "compliance_case_notes" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_case_notes" ALTER COLUMN "case_id" SET NOT NULL;
ALTER TABLE "compliance_case_notes" ALTER COLUMN "body" SET NOT NULL;
ALTER TABLE "compliance_case_notes" ALTER COLUMN "created_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "compliance_case_notes_case_id_created_at_idx" ON "compliance_case_notes"("case_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "compliance_case_notes" ADD CONSTRAINT "compliance_case_notes_case_id_fkey"
    FOREIGN KEY ("case_id") REFERENCES "compliance_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 5. compliance_case_events
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_case_events" (
  "id" UUID NOT NULL,
  CONSTRAINT "compliance_case_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "compliance_case_events" ADD COLUMN IF NOT EXISTS "case_id" UUID;
ALTER TABLE "compliance_case_events" ADD COLUMN IF NOT EXISTS "action" TEXT;
ALTER TABLE "compliance_case_events" ADD COLUMN IF NOT EXISTS "actor_admin_id" UUID;
ALTER TABLE "compliance_case_events" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "compliance_case_events" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);

ALTER TABLE "compliance_case_events" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_case_events" ALTER COLUMN "case_id" SET NOT NULL;
ALTER TABLE "compliance_case_events" ALTER COLUMN "action" SET NOT NULL;
ALTER TABLE "compliance_case_events" ALTER COLUMN "created_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "compliance_case_events_case_id_created_at_idx" ON "compliance_case_events"("case_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "compliance_case_events" ADD CONSTRAINT "compliance_case_events_case_id_fkey"
    FOREIGN KEY ("case_id") REFERENCES "compliance_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
