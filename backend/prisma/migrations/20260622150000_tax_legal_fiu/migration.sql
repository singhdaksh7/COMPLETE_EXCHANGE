-- Stage 5.5/5.6 — Tax/TDS + Legal Acceptance + FIU Draft Reporting Foundation
--
-- Additive only: 11 new enums + 10 new tables. No existing table is altered,
-- rewritten, or deleted. TDS is CALCULATION-ONLY (never deducted from the
-- ledger); FIU drafts are NEVER submitted. Nothing here touches the ledger,
-- scanner, matching engine, or withdrawal signing, and nothing is auto-deleted.
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as Stage 5.2–5.4):
--   * enum create wrapped in DO/EXCEPTION duplicate_object
--   * CREATE TABLE IF NOT EXISTS with only the id PK
--   * columns via ADD COLUMN IF NOT EXISTS, then defaults, then NOT NULL
--   * CREATE [UNIQUE] INDEX IF NOT EXISTS
--   * FK constraints wrapped in DO/EXCEPTION duplicate_object

-- ===========================================================================
-- 1. Enums
-- ===========================================================================
DO $$ BEGIN CREATE TYPE "TaxRuleStatus" AS ENUM ('ACTIVE', 'DISABLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TaxEventType" AS ENUM ('TRADE_SELL', 'WITHDRAWAL', 'CONVERSION', 'FEE', 'OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TdsRecordStatus" AS ENUM ('CALCULATED', 'WAIVED', 'REVERSED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TaxStatementStatus" AS ENUM ('DRAFT', 'GENERATED', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'RISK_DISCLOSURE', 'AML_POLICY_NOTICE', 'FEE_POLICY', 'TAX_DISCLOSURE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "LegalAcceptanceStatus" AS ENUM ('ACCEPTED', 'REVOKED', 'SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FiuReportType" AS ENUM ('STR', 'CTR', 'NTR', 'CBWTR', 'INTERNAL_SUSPICIOUS_ACTIVITY_SUMMARY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FiuDraftStatus" AS ENUM ('DRAFT', 'VALIDATING', 'READY_FOR_INTERNAL_REVIEW', 'EXPORTED_DRAFT', 'FAILED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FiuReportFormat" AS ENUM ('JSON_DRAFT', 'XML_PLACEHOLDER', 'CSV_PLACEHOLDER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FiuValidationSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FiuReportScopeType" AS ENUM ('USER', 'CASE', 'DATE_RANGE', 'TRANSACTION_SET'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 2. tax_rules
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "tax_rules" ( "id" UUID NOT NULL, CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id") );
ALTER TABLE "tax_rules" ADD COLUMN IF NOT EXISTS "event_type" "TaxEventType";
ALTER TABLE "tax_rules" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "tax_rules" ADD COLUMN IF NOT EXISTS "rate_bps" INTEGER;
ALTER TABLE "tax_rules" ADD COLUMN IF NOT EXISTS "threshold_amount" DECIMAL(38,18);
ALTER TABLE "tax_rules" ADD COLUMN IF NOT EXISTS "status" "TaxRuleStatus";
ALTER TABLE "tax_rules" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "tax_rules" ADD COLUMN IF NOT EXISTS "created_by_admin_id" UUID;
ALTER TABLE "tax_rules" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "tax_rules" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "tax_rules" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "tax_rules" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tax_rules" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tax_rules" ALTER COLUMN "event_type" SET NOT NULL;
ALTER TABLE "tax_rules" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "tax_rules" ALTER COLUMN "rate_bps" SET NOT NULL;
ALTER TABLE "tax_rules" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "tax_rules" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "tax_rules" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tax_rules_event_type_key" ON "tax_rules"("event_type");

-- ===========================================================================
-- 3. user_tax_profiles
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "user_tax_profiles" ( "id" UUID NOT NULL, CONSTRAINT "user_tax_profiles_pkey" PRIMARY KEY ("id") );
ALTER TABLE "user_tax_profiles" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "user_tax_profiles" ADD COLUMN IF NOT EXISTS "pan_available" BOOLEAN;
ALTER TABLE "user_tax_profiles" ADD COLUMN IF NOT EXISTS "pan_status" TEXT;
ALTER TABLE "user_tax_profiles" ADD COLUMN IF NOT EXISTS "resident_status" TEXT;
ALTER TABLE "user_tax_profiles" ADD COLUMN IF NOT EXISTS "tax_jurisdiction" TEXT;
ALTER TABLE "user_tax_profiles" ADD COLUMN IF NOT EXISTS "higher_tds_applicable" BOOLEAN;
ALTER TABLE "user_tax_profiles" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "user_tax_profiles" ADD COLUMN IF NOT EXISTS "updated_by_admin_id" UUID;
ALTER TABLE "user_tax_profiles" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "user_tax_profiles" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "user_tax_profiles" ALTER COLUMN "pan_available" SET DEFAULT false;
ALTER TABLE "user_tax_profiles" ALTER COLUMN "tax_jurisdiction" SET DEFAULT 'IN';
ALTER TABLE "user_tax_profiles" ALTER COLUMN "higher_tds_applicable" SET DEFAULT false;
ALTER TABLE "user_tax_profiles" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "user_tax_profiles" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "user_tax_profiles" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "user_tax_profiles" ALTER COLUMN "pan_available" SET NOT NULL;
ALTER TABLE "user_tax_profiles" ALTER COLUMN "tax_jurisdiction" SET NOT NULL;
ALTER TABLE "user_tax_profiles" ALTER COLUMN "higher_tds_applicable" SET NOT NULL;
ALTER TABLE "user_tax_profiles" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "user_tax_profiles" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "user_tax_profiles_user_id_key" ON "user_tax_profiles"("user_id");
DO $$ BEGIN ALTER TABLE "user_tax_profiles" ADD CONSTRAINT "user_tax_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 4. tds_records
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "tds_records" ( "id" UUID NOT NULL, CONSTRAINT "tds_records_pkey" PRIMARY KEY ("id") );
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "event_type" "TaxEventType";
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "rule_id" UUID;
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "source_type" TEXT;
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "source_ref" TEXT;
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "gross_amount" DECIMAL(38,18);
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "asset" TEXT;
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "rate_bps" INTEGER;
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "tds_amount" DECIMAL(38,18);
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "status" "TdsRecordStatus";
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "financial_year" TEXT;
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "created_by_admin_id" UUID;
ALTER TABLE "tds_records" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "tds_records" ALTER COLUMN "status" SET DEFAULT 'CALCULATED';
ALTER TABLE "tds_records" ALTER COLUMN "label" SET DEFAULT 'TAX_TDS_STAGING_CALCULATION_ONLY';
ALTER TABLE "tds_records" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tds_records" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "tds_records" ALTER COLUMN "event_type" SET NOT NULL;
ALTER TABLE "tds_records" ALTER COLUMN "gross_amount" SET NOT NULL;
ALTER TABLE "tds_records" ALTER COLUMN "rate_bps" SET NOT NULL;
ALTER TABLE "tds_records" ALTER COLUMN "tds_amount" SET NOT NULL;
ALTER TABLE "tds_records" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "tds_records" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "tds_records" ALTER COLUMN "created_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "tds_records_user_id_created_at_idx" ON "tds_records"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "tds_records_event_type_idx" ON "tds_records"("event_type");
CREATE INDEX IF NOT EXISTS "tds_records_status_idx" ON "tds_records"("status");
DO $$ BEGIN ALTER TABLE "tds_records" ADD CONSTRAINT "tds_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "tds_records" ADD CONSTRAINT "tds_records_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "tax_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 5. tax_statements
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "tax_statements" ( "id" UUID NOT NULL, CONSTRAINT "tax_statements_pkey" PRIMARY KEY ("id") );
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "financial_year" TEXT;
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "status" "TaxStatementStatus";
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "total_gross" DECIMAL(38,18);
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "total_tds" DECIMAL(38,18);
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "record_count" INTEGER;
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "payload" JSONB;
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "generated_by_admin_id" UUID;
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "tax_statements" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "tax_statements" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "tax_statements" ALTER COLUMN "label" SET DEFAULT 'TAX_TDS_STAGING_CALCULATION_ONLY';
ALTER TABLE "tax_statements" ALTER COLUMN "total_gross" SET DEFAULT 0;
ALTER TABLE "tax_statements" ALTER COLUMN "total_tds" SET DEFAULT 0;
ALTER TABLE "tax_statements" ALTER COLUMN "record_count" SET DEFAULT 0;
ALTER TABLE "tax_statements" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tax_statements" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tax_statements" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "tax_statements" ALTER COLUMN "financial_year" SET NOT NULL;
ALTER TABLE "tax_statements" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "tax_statements" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "tax_statements" ALTER COLUMN "total_gross" SET NOT NULL;
ALTER TABLE "tax_statements" ALTER COLUMN "total_tds" SET NOT NULL;
ALTER TABLE "tax_statements" ALTER COLUMN "record_count" SET NOT NULL;
ALTER TABLE "tax_statements" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "tax_statements" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "tax_statements_user_id_financial_year_idx" ON "tax_statements"("user_id", "financial_year");
CREATE INDEX IF NOT EXISTS "tax_statements_status_idx" ON "tax_statements"("status");
DO $$ BEGIN ALTER TABLE "tax_statements" ADD CONSTRAINT "tax_statements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 6. legal_document_versions
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "legal_document_versions" ( "id" UUID NOT NULL, CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id") );
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "type" "LegalDocumentType";
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "version" TEXT;
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "content" TEXT;
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "is_current" BOOLEAN;
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "effective_at" TIMESTAMP(3);
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "created_by_admin_id" UUID;
ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "legal_document_versions" ALTER COLUMN "is_current" SET DEFAULT false;
ALTER TABLE "legal_document_versions" ALTER COLUMN "effective_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "legal_document_versions" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "legal_document_versions" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "legal_document_versions" ALTER COLUMN "version" SET NOT NULL;
ALTER TABLE "legal_document_versions" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "legal_document_versions" ALTER COLUMN "content" SET NOT NULL;
ALTER TABLE "legal_document_versions" ALTER COLUMN "checksum" SET NOT NULL;
ALTER TABLE "legal_document_versions" ALTER COLUMN "is_current" SET NOT NULL;
ALTER TABLE "legal_document_versions" ALTER COLUMN "effective_at" SET NOT NULL;
ALTER TABLE "legal_document_versions" ALTER COLUMN "created_at" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "legal_document_versions_type_version_key" ON "legal_document_versions"("type", "version");
CREATE INDEX IF NOT EXISTS "legal_document_versions_type_is_current_idx" ON "legal_document_versions"("type", "is_current");

-- ===========================================================================
-- 7. user_legal_acceptances
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "user_legal_acceptances" ( "id" UUID NOT NULL, CONSTRAINT "user_legal_acceptances_pkey" PRIMARY KEY ("id") );
ALTER TABLE "user_legal_acceptances" ADD COLUMN IF NOT EXISTS "user_id" UUID;
ALTER TABLE "user_legal_acceptances" ADD COLUMN IF NOT EXISTS "document_type" "LegalDocumentType";
ALTER TABLE "user_legal_acceptances" ADD COLUMN IF NOT EXISTS "document_version_id" UUID;
ALTER TABLE "user_legal_acceptances" ADD COLUMN IF NOT EXISTS "version" TEXT;
ALTER TABLE "user_legal_acceptances" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "user_legal_acceptances" ADD COLUMN IF NOT EXISTS "status" "LegalAcceptanceStatus";
ALTER TABLE "user_legal_acceptances" ADD COLUMN IF NOT EXISTS "ip" TEXT;
ALTER TABLE "user_legal_acceptances" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "user_legal_acceptances" ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP(3);
ALTER TABLE "user_legal_acceptances" ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3);
ALTER TABLE "user_legal_acceptances" ALTER COLUMN "status" SET DEFAULT 'ACCEPTED';
ALTER TABLE "user_legal_acceptances" ALTER COLUMN "accepted_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "user_legal_acceptances" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "user_legal_acceptances" ALTER COLUMN "document_type" SET NOT NULL;
ALTER TABLE "user_legal_acceptances" ALTER COLUMN "version" SET NOT NULL;
ALTER TABLE "user_legal_acceptances" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "user_legal_acceptances" ALTER COLUMN "accepted_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "user_legal_acceptances_user_id_document_type_idx" ON "user_legal_acceptances"("user_id", "document_type");
DO $$ BEGIN ALTER TABLE "user_legal_acceptances" ADD CONSTRAINT "user_legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "user_legal_acceptances" ADD CONSTRAINT "user_legal_acceptances_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "legal_document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 8. fiu_draft_reports
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "fiu_draft_reports" ( "id" UUID NOT NULL, CONSTRAINT "fiu_draft_reports_pkey" PRIMARY KEY ("id") );
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "report_type" "FiuReportType";
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "status" "FiuDraftStatus";
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "scope_type" "FiuReportScopeType";
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "format" "FiuReportFormat";
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "submission_state" TEXT;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "narrative" TEXT;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "scope_user_id" UUID;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "scope_case_id" UUID;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "evidence_pack_id" UUID;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "period_start" TIMESTAMP(3);
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "period_end" TIMESTAMP(3);
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "source_refs" JSONB;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "payload" JSONB;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "error_count" INTEGER;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "warning_count" INTEGER;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "generated_by_admin_id" UUID;
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "fiu_draft_reports" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "format" SET DEFAULT 'JSON_DRAFT';
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "label" SET DEFAULT 'FIU_DRAFT_REPORT_STAGING_ONLY';
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "submission_state" SET DEFAULT 'NOT_SUBMITTED_TO_FIU';
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "error_count" SET DEFAULT 0;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "warning_count" SET DEFAULT 0;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "report_type" SET NOT NULL;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "scope_type" SET NOT NULL;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "format" SET NOT NULL;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "submission_state" SET NOT NULL;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "error_count" SET NOT NULL;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "warning_count" SET NOT NULL;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "fiu_draft_reports" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "fiu_draft_reports_report_type_idx" ON "fiu_draft_reports"("report_type");
CREATE INDEX IF NOT EXISTS "fiu_draft_reports_status_idx" ON "fiu_draft_reports"("status");
CREATE INDEX IF NOT EXISTS "fiu_draft_reports_scope_user_id_created_at_idx" ON "fiu_draft_reports"("scope_user_id", "created_at");
DO $$ BEGIN ALTER TABLE "fiu_draft_reports" ADD CONSTRAINT "fiu_draft_reports_scope_user_id_fkey" FOREIGN KEY ("scope_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "fiu_draft_reports" ADD CONSTRAINT "fiu_draft_reports_evidence_pack_id_fkey" FOREIGN KEY ("evidence_pack_id") REFERENCES "compliance_evidence_packs"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 9. fiu_draft_report_items
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "fiu_draft_report_items" ( "id" UUID NOT NULL, CONSTRAINT "fiu_draft_report_items_pkey" PRIMARY KEY ("id") );
ALTER TABLE "fiu_draft_report_items" ADD COLUMN IF NOT EXISTS "report_id" UUID;
ALTER TABLE "fiu_draft_report_items" ADD COLUMN IF NOT EXISTS "item_type" TEXT;
ALTER TABLE "fiu_draft_report_items" ADD COLUMN IF NOT EXISTS "ref_id" TEXT;
ALTER TABLE "fiu_draft_report_items" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "fiu_draft_report_items" ADD COLUMN IF NOT EXISTS "data" JSONB;
ALTER TABLE "fiu_draft_report_items" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "fiu_draft_report_items" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "fiu_draft_report_items" ALTER COLUMN "report_id" SET NOT NULL;
ALTER TABLE "fiu_draft_report_items" ALTER COLUMN "item_type" SET NOT NULL;
ALTER TABLE "fiu_draft_report_items" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "fiu_draft_report_items" ALTER COLUMN "data" SET NOT NULL;
ALTER TABLE "fiu_draft_report_items" ALTER COLUMN "created_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "fiu_draft_report_items_report_id_idx" ON "fiu_draft_report_items"("report_id");
DO $$ BEGIN ALTER TABLE "fiu_draft_report_items" ADD CONSTRAINT "fiu_draft_report_items_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "fiu_draft_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 10. fiu_report_validation_issues
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "fiu_report_validation_issues" ( "id" UUID NOT NULL, CONSTRAINT "fiu_report_validation_issues_pkey" PRIMARY KEY ("id") );
ALTER TABLE "fiu_report_validation_issues" ADD COLUMN IF NOT EXISTS "report_id" UUID;
ALTER TABLE "fiu_report_validation_issues" ADD COLUMN IF NOT EXISTS "severity" "FiuValidationSeverity";
ALTER TABLE "fiu_report_validation_issues" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "fiu_report_validation_issues" ADD COLUMN IF NOT EXISTS "field" TEXT;
ALTER TABLE "fiu_report_validation_issues" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "fiu_report_validation_issues" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "fiu_report_validation_issues" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "fiu_report_validation_issues" ALTER COLUMN "report_id" SET NOT NULL;
ALTER TABLE "fiu_report_validation_issues" ALTER COLUMN "severity" SET NOT NULL;
ALTER TABLE "fiu_report_validation_issues" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "fiu_report_validation_issues" ALTER COLUMN "message" SET NOT NULL;
ALTER TABLE "fiu_report_validation_issues" ALTER COLUMN "created_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "fiu_report_validation_issues_report_id_idx" ON "fiu_report_validation_issues"("report_id");
DO $$ BEGIN ALTER TABLE "fiu_report_validation_issues" ADD CONSTRAINT "fiu_report_validation_issues_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "fiu_draft_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 11. fiu_report_export_events
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "fiu_report_export_events" ( "id" UUID NOT NULL, CONSTRAINT "fiu_report_export_events_pkey" PRIMARY KEY ("id") );
ALTER TABLE "fiu_report_export_events" ADD COLUMN IF NOT EXISTS "report_id" UUID;
ALTER TABLE "fiu_report_export_events" ADD COLUMN IF NOT EXISTS "report_type" "FiuReportType";
ALTER TABLE "fiu_report_export_events" ADD COLUMN IF NOT EXISTS "format" TEXT;
ALTER TABLE "fiu_report_export_events" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "fiu_report_export_events" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "fiu_report_export_events" ADD COLUMN IF NOT EXISTS "submission_state" TEXT;
ALTER TABLE "fiu_report_export_events" ADD COLUMN IF NOT EXISTS "admin_id" UUID;
ALTER TABLE "fiu_report_export_events" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "fiu_report_export_events" ALTER COLUMN "label" SET DEFAULT 'FIU_DRAFT_REPORT_STAGING_ONLY';
ALTER TABLE "fiu_report_export_events" ALTER COLUMN "submission_state" SET DEFAULT 'NOT_SUBMITTED_TO_FIU';
ALTER TABLE "fiu_report_export_events" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "fiu_report_export_events" ALTER COLUMN "report_id" SET NOT NULL;
ALTER TABLE "fiu_report_export_events" ALTER COLUMN "report_type" SET NOT NULL;
ALTER TABLE "fiu_report_export_events" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "fiu_report_export_events" ALTER COLUMN "submission_state" SET NOT NULL;
ALTER TABLE "fiu_report_export_events" ALTER COLUMN "created_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "fiu_report_export_events_report_id_idx" ON "fiu_report_export_events"("report_id");
CREATE INDEX IF NOT EXISTS "fiu_report_export_events_report_type_created_at_idx" ON "fiu_report_export_events"("report_type", "created_at");
DO $$ BEGIN ALTER TABLE "fiu_report_export_events" ADD CONSTRAINT "fiu_report_export_events_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "fiu_draft_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
