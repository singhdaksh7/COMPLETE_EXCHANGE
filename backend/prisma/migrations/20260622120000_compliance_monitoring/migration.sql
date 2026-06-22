-- Stage 5.2 — Suspicious Transaction Monitoring + STR Case Workflow
-- Additive only: five new enums + four new tables (compliance_alerts,
-- compliance_cases, compliance_case_notes, compliance_case_events). No existing
-- table is altered, rewritten, or deleted. The monitoring engine READS
-- deposits / withdrawals / trades / inr_transactions but never mutates them, and
-- these records are never auto-deleted (record-retention baseline).

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------
CREATE TYPE "ComplianceAlertType" AS ENUM ('HIGH_VALUE_WITHDRAWAL', 'RAPID_DEPOSIT_WITHDRAWAL', 'STRUCTURING_PATTERN', 'ABNORMAL_TRADING_VOLUME', 'REPEATED_FAILED_WITHDRAWALS', 'HIGH_RISK_USER_ACTIVITY', 'SCREENING_RISK_ACTIVITY');
CREATE TYPE "ComplianceAlertStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'LINKED_TO_CASE', 'DISMISSED', 'RESOLVED');
CREATE TYPE "ComplianceCaseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ESCALATED', 'STR_DRAFTED', 'CLOSED');
CREATE TYPE "ComplianceCasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ComplianceCaseType" AS ENUM ('SUSPICIOUS_TRANSACTION', 'HIGH_RISK_USER', 'WALLET_RISK', 'SCREENING_MATCH', 'MANUAL_REVIEW');

-- ---------------------------------------------------------------------------
-- compliance_cases (created before compliance_alerts: alerts FK -> cases)
-- ---------------------------------------------------------------------------
CREATE TABLE "compliance_cases" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "ComplianceCaseType" NOT NULL DEFAULT 'SUSPICIOUS_TRANSACTION',
  "status" "ComplianceCaseStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "ComplianceCasePriority" NOT NULL DEFAULT 'MEDIUM',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "dedupe_key" TEXT,
  "assigned_to_admin_id" UUID,
  "opened_by_admin_id" UUID,
  "closed_by_admin_id" UUID,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "compliance_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compliance_cases_dedupe_key_key" ON "compliance_cases"("dedupe_key");
CREATE INDEX "compliance_cases_user_id_created_at_idx" ON "compliance_cases"("user_id", "created_at");
CREATE INDEX "compliance_cases_status_idx" ON "compliance_cases"("status");
CREATE INDEX "compliance_cases_priority_idx" ON "compliance_cases"("priority");
CREATE INDEX "compliance_cases_assigned_to_admin_id_idx" ON "compliance_cases"("assigned_to_admin_id");

ALTER TABLE "compliance_cases" ADD CONSTRAINT "compliance_cases_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- compliance_alerts
-- ---------------------------------------------------------------------------
CREATE TABLE "compliance_alerts" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "ComplianceAlertType" NOT NULL,
  "status" "ComplianceAlertStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "ComplianceCasePriority" NOT NULL DEFAULT 'LOW',
  "score" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dedupe_key" TEXT NOT NULL,
  "details" JSONB,
  "case_id" UUID,
  "resolved_by_admin_id" UUID,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "compliance_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compliance_alerts_dedupe_key_key" ON "compliance_alerts"("dedupe_key");
CREATE INDEX "compliance_alerts_user_id_created_at_idx" ON "compliance_alerts"("user_id", "created_at");
CREATE INDEX "compliance_alerts_status_idx" ON "compliance_alerts"("status");
CREATE INDEX "compliance_alerts_type_idx" ON "compliance_alerts"("type");
CREATE INDEX "compliance_alerts_case_id_idx" ON "compliance_alerts"("case_id");

ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "compliance_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- compliance_case_notes
-- ---------------------------------------------------------------------------
CREATE TABLE "compliance_case_notes" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "admin_id" UUID,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "compliance_case_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_case_notes_case_id_created_at_idx" ON "compliance_case_notes"("case_id", "created_at");

ALTER TABLE "compliance_case_notes" ADD CONSTRAINT "compliance_case_notes_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "compliance_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- compliance_case_events
-- ---------------------------------------------------------------------------
CREATE TABLE "compliance_case_events" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "actor_admin_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "compliance_case_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_case_events_case_id_created_at_idx" ON "compliance_case_events"("case_id", "created_at");

ALTER TABLE "compliance_case_events" ADD CONSTRAINT "compliance_case_events_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "compliance_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
