-- Stage 5.7 — AML Policy Engine + Compliance Officer Workspace
--
-- Additive only: 10 new enums + 8 new tables. No existing table is altered,
-- rewritten, or deleted. The policy engine is REVIEW-ONLY; nothing here moves
-- money, submits a report, or deletes records.
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as Stage 5.2–5.6):
--   * enum create wrapped in DO/EXCEPTION duplicate_object
--   * CREATE TABLE IF NOT EXISTS with only the id PK
--   * columns via ADD COLUMN IF NOT EXISTS, then defaults, then NOT NULL
--   * CREATE [UNIQUE] INDEX IF NOT EXISTS
--   * FK constraints wrapped in DO/EXCEPTION duplicate_object

-- ===========================================================================
-- 1. Enums
-- ===========================================================================
DO $$ BEGIN CREATE TYPE "AmlPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AmlRuleType" AS ENUM ('TRANSACTION_MONITORING', 'WALLET_RISK', 'USER_RISK', 'KYC', 'FIU_DRAFT', 'TAX_LEGAL', 'MANUAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AmlRuleSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AmlRuleAction" AS ENUM ('FLAG_ONLY', 'CREATE_ALERT', 'CREATE_CASE', 'REQUIRE_REVIEW', 'ESCALATE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ComplianceTaskType" AS ENUM ('KYC_REVIEW', 'SCREENING_REVIEW', 'STR_CASE_REVIEW', 'WALLET_RISK_REVIEW', 'TRAVEL_RULE_REVIEW', 'FIU_DRAFT_REVIEW', 'TAX_LEGAL_REVIEW', 'GENERAL_AML_REVIEW'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ComplianceTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_INFO', 'ESCALATED', 'COMPLETED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ComplianceTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ComplianceApprovalType" AS ENUM ('FIU_DRAFT_EXPORT', 'CASE_STATUS_CHANGE', 'RISK_OVERRIDE', 'SCREENING_OVERRIDE', 'WALLET_RISK_OVERRIDE', 'LEGAL_POLICY_PUBLISH'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ComplianceApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SlaStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'BREACHED', 'COMPLETED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 2. aml_policy_versions
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "aml_policy_versions" ( "id" UUID NOT NULL, CONSTRAINT "aml_policy_versions_pkey" PRIMARY KEY ("id") );
ALTER TABLE "aml_policy_versions" ADD COLUMN IF NOT EXISTS "version" TEXT;
ALTER TABLE "aml_policy_versions" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "aml_policy_versions" ADD COLUMN IF NOT EXISTS "status" "AmlPolicyStatus";
ALTER TABLE "aml_policy_versions" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "aml_policy_versions" ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3);
ALTER TABLE "aml_policy_versions" ADD COLUMN IF NOT EXISTS "activated_by_admin_id" UUID;
ALTER TABLE "aml_policy_versions" ADD COLUMN IF NOT EXISTS "created_by_admin_id" UUID;
ALTER TABLE "aml_policy_versions" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "aml_policy_versions" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "aml_policy_versions" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "aml_policy_versions" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "aml_policy_versions" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "aml_policy_versions" ALTER COLUMN "version" SET NOT NULL;
ALTER TABLE "aml_policy_versions" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "aml_policy_versions" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "aml_policy_versions" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "aml_policy_versions" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "aml_policy_versions_version_key" ON "aml_policy_versions"("version");
CREATE INDEX IF NOT EXISTS "aml_policy_versions_status_idx" ON "aml_policy_versions"("status");

-- ===========================================================================
-- 3. aml_policy_rules
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "aml_policy_rules" ( "id" UUID NOT NULL, CONSTRAINT "aml_policy_rules_pkey" PRIMARY KEY ("id") );
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "policy_id" UUID;
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "rule_type" "AmlRuleType";
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "severity" "AmlRuleSeverity";
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "action" "AmlRuleAction";
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "condition_key" TEXT;
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "operator" TEXT;
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "threshold_value" TEXT;
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN;
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "aml_policy_rules" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "aml_policy_rules" ALTER COLUMN "severity" SET DEFAULT 'MEDIUM';
ALTER TABLE "aml_policy_rules" ALTER COLUMN "action" SET DEFAULT 'FLAG_ONLY';
ALTER TABLE "aml_policy_rules" ALTER COLUMN "enabled" SET DEFAULT true;
ALTER TABLE "aml_policy_rules" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "aml_policy_rules" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "aml_policy_rules" ALTER COLUMN "policy_id" SET NOT NULL;
ALTER TABLE "aml_policy_rules" ALTER COLUMN "rule_type" SET NOT NULL;
ALTER TABLE "aml_policy_rules" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "aml_policy_rules" ALTER COLUMN "severity" SET NOT NULL;
ALTER TABLE "aml_policy_rules" ALTER COLUMN "action" SET NOT NULL;
ALTER TABLE "aml_policy_rules" ALTER COLUMN "enabled" SET NOT NULL;
ALTER TABLE "aml_policy_rules" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "aml_policy_rules" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "aml_policy_rules_policy_id_idx" ON "aml_policy_rules"("policy_id");
CREATE INDEX IF NOT EXISTS "aml_policy_rules_rule_type_idx" ON "aml_policy_rules"("rule_type");
DO $$ BEGIN ALTER TABLE "aml_policy_rules" ADD CONSTRAINT "aml_policy_rules_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "aml_policy_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 4. compliance_tasks
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_tasks" ( "id" UUID NOT NULL, CONSTRAINT "compliance_tasks_pkey" PRIMARY KEY ("id") );
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "type" "ComplianceTaskType";
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "status" "ComplianceTaskStatus";
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "priority" "ComplianceTaskPriority";
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "assigned_to_admin_id" UUID;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "created_by_admin_id" UUID;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMP(3);
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "sla_minutes" INTEGER;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "scope_user_id" UUID;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "case_id" UUID;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "alert_id" UUID;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "wallet_risk_check_id" UUID;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "fiu_report_id" UUID;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "evidence_pack_id" UUID;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "compliance_tasks" ALTER COLUMN "status" SET DEFAULT 'OPEN';
ALTER TABLE "compliance_tasks" ALTER COLUMN "priority" SET DEFAULT 'MEDIUM';
ALTER TABLE "compliance_tasks" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_tasks" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_tasks" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "compliance_tasks" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "compliance_tasks" ALTER COLUMN "priority" SET NOT NULL;
ALTER TABLE "compliance_tasks" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "compliance_tasks" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "compliance_tasks" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "compliance_tasks_dedupe_key_key" ON "compliance_tasks"("dedupe_key");
CREATE INDEX IF NOT EXISTS "compliance_tasks_status_idx" ON "compliance_tasks"("status");
CREATE INDEX IF NOT EXISTS "compliance_tasks_priority_idx" ON "compliance_tasks"("priority");
CREATE INDEX IF NOT EXISTS "compliance_tasks_assigned_to_admin_id_idx" ON "compliance_tasks"("assigned_to_admin_id");
CREATE INDEX IF NOT EXISTS "compliance_tasks_scope_user_id_created_at_idx" ON "compliance_tasks"("scope_user_id", "created_at");
DO $$ BEGIN ALTER TABLE "compliance_tasks" ADD CONSTRAINT "compliance_tasks_scope_user_id_fkey" FOREIGN KEY ("scope_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 5. compliance_task_events
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_task_events" ( "id" UUID NOT NULL, CONSTRAINT "compliance_task_events_pkey" PRIMARY KEY ("id") );
ALTER TABLE "compliance_task_events" ADD COLUMN IF NOT EXISTS "task_id" UUID;
ALTER TABLE "compliance_task_events" ADD COLUMN IF NOT EXISTS "action" TEXT;
ALTER TABLE "compliance_task_events" ADD COLUMN IF NOT EXISTS "actor_admin_id" UUID;
ALTER TABLE "compliance_task_events" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "compliance_task_events" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "compliance_task_events" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_task_events" ALTER COLUMN "task_id" SET NOT NULL;
ALTER TABLE "compliance_task_events" ALTER COLUMN "action" SET NOT NULL;
ALTER TABLE "compliance_task_events" ALTER COLUMN "created_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "compliance_task_events_task_id_created_at_idx" ON "compliance_task_events"("task_id", "created_at");
DO $$ BEGIN ALTER TABLE "compliance_task_events" ADD CONSTRAINT "compliance_task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "compliance_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 6. aml_checklist_templates
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "aml_checklist_templates" ( "id" UUID NOT NULL, CONSTRAINT "aml_checklist_templates_pkey" PRIMARY KEY ("id") );
ALTER TABLE "aml_checklist_templates" ADD COLUMN IF NOT EXISTS "task_type" "ComplianceTaskType";
ALTER TABLE "aml_checklist_templates" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "aml_checklist_templates" ADD COLUMN IF NOT EXISTS "version" TEXT;
ALTER TABLE "aml_checklist_templates" ADD COLUMN IF NOT EXISTS "items" JSONB;
ALTER TABLE "aml_checklist_templates" ADD COLUMN IF NOT EXISTS "required_for_completion" BOOLEAN;
ALTER TABLE "aml_checklist_templates" ADD COLUMN IF NOT EXISTS "active" BOOLEAN;
ALTER TABLE "aml_checklist_templates" ADD COLUMN IF NOT EXISTS "created_by_admin_id" UUID;
ALTER TABLE "aml_checklist_templates" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "aml_checklist_templates" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "version" SET DEFAULT 'v1';
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "required_for_completion" SET DEFAULT false;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "task_type" SET NOT NULL;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "version" SET NOT NULL;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "items" SET NOT NULL;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "required_for_completion" SET NOT NULL;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "active" SET NOT NULL;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "aml_checklist_templates" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "aml_checklist_templates_task_type_active_idx" ON "aml_checklist_templates"("task_type", "active");

-- ===========================================================================
-- 7. aml_checklist_responses
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "aml_checklist_responses" ( "id" UUID NOT NULL, CONSTRAINT "aml_checklist_responses_pkey" PRIMARY KEY ("id") );
ALTER TABLE "aml_checklist_responses" ADD COLUMN IF NOT EXISTS "task_id" UUID;
ALTER TABLE "aml_checklist_responses" ADD COLUMN IF NOT EXISTS "template_id" UUID;
ALTER TABLE "aml_checklist_responses" ADD COLUMN IF NOT EXISTS "answers" JSONB;
ALTER TABLE "aml_checklist_responses" ADD COLUMN IF NOT EXISTS "completed" BOOLEAN;
ALTER TABLE "aml_checklist_responses" ADD COLUMN IF NOT EXISTS "completed_by_admin_id" UUID;
ALTER TABLE "aml_checklist_responses" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "aml_checklist_responses" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "aml_checklist_responses" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "aml_checklist_responses" ALTER COLUMN "completed" SET DEFAULT false;
ALTER TABLE "aml_checklist_responses" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "aml_checklist_responses" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "aml_checklist_responses" ALTER COLUMN "task_id" SET NOT NULL;
ALTER TABLE "aml_checklist_responses" ALTER COLUMN "answers" SET NOT NULL;
ALTER TABLE "aml_checklist_responses" ALTER COLUMN "completed" SET NOT NULL;
ALTER TABLE "aml_checklist_responses" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "aml_checklist_responses" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "aml_checklist_responses_task_id_idx" ON "aml_checklist_responses"("task_id");
DO $$ BEGIN ALTER TABLE "aml_checklist_responses" ADD CONSTRAINT "aml_checklist_responses_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "compliance_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "aml_checklist_responses" ADD CONSTRAINT "aml_checklist_responses_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "aml_checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 8. compliance_approval_requests
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_approval_requests" ( "id" UUID NOT NULL, CONSTRAINT "compliance_approval_requests_pkey" PRIMARY KEY ("id") );
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "approval_type" "ComplianceApprovalType";
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "status" "ComplianceApprovalStatus";
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "target_type" TEXT;
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "target_id" TEXT;
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "task_id" UUID;
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "maker_admin_id" UUID;
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "checker_admin_id" UUID;
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "decision_note" TEXT;
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMP(3);
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "compliance_approval_requests" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "compliance_approval_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "compliance_approval_requests" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_approval_requests" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_approval_requests" ALTER COLUMN "approval_type" SET NOT NULL;
ALTER TABLE "compliance_approval_requests" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "compliance_approval_requests" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "compliance_approval_requests" ALTER COLUMN "maker_admin_id" SET NOT NULL;
ALTER TABLE "compliance_approval_requests" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "compliance_approval_requests" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "compliance_approval_requests_status_idx" ON "compliance_approval_requests"("status");
CREATE INDEX IF NOT EXISTS "compliance_approval_requests_approval_type_idx" ON "compliance_approval_requests"("approval_type");
CREATE INDEX IF NOT EXISTS "compliance_approval_requests_maker_admin_id_idx" ON "compliance_approval_requests"("maker_admin_id");

-- ===========================================================================
-- 9. compliance_sla_trackers
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_sla_trackers" ( "id" UUID NOT NULL, CONSTRAINT "compliance_sla_trackers_pkey" PRIMARY KEY ("id") );
ALTER TABLE "compliance_sla_trackers" ADD COLUMN IF NOT EXISTS "task_id" UUID;
ALTER TABLE "compliance_sla_trackers" ADD COLUMN IF NOT EXISTS "sla_minutes" INTEGER;
ALTER TABLE "compliance_sla_trackers" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP(3);
ALTER TABLE "compliance_sla_trackers" ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMP(3);
ALTER TABLE "compliance_sla_trackers" ADD COLUMN IF NOT EXISTS "status" "SlaStatus";
ALTER TABLE "compliance_sla_trackers" ADD COLUMN IF NOT EXISTS "breached_at" TIMESTAMP(3);
ALTER TABLE "compliance_sla_trackers" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "compliance_sla_trackers" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "compliance_sla_trackers" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "started_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "status" SET DEFAULT 'ON_TRACK';
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "task_id" SET NOT NULL;
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "sla_minutes" SET NOT NULL;
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "started_at" SET NOT NULL;
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "due_at" SET NOT NULL;
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "compliance_sla_trackers" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "compliance_sla_trackers_task_id_key" ON "compliance_sla_trackers"("task_id");
CREATE INDEX IF NOT EXISTS "compliance_sla_trackers_status_idx" ON "compliance_sla_trackers"("status");
DO $$ BEGIN ALTER TABLE "compliance_sla_trackers" ADD CONSTRAINT "compliance_sla_trackers_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "compliance_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
