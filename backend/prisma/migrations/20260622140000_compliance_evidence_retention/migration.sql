-- Stage 5.4 — Record Retention + Compliance Evidence Pack
--
-- Additive only: six new enums + five new tables (compliance_evidence_packs,
-- compliance_evidence_pack_items, record_retention_policies,
-- record_retention_reviews, compliance_export_events). No existing table is
-- altered, rewritten, or deleted. Evidence packs only READ existing compliance
-- data; nothing here files an FIU report, deletes a record, or touches the
-- ledger / scanner / matching engine / withdrawal signing.
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as Stage 5.2/5.3):
--   * enum create wrapped in DO/EXCEPTION duplicate_object
--   * CREATE TABLE IF NOT EXISTS with only the id PK
--   * columns via ADD COLUMN IF NOT EXISTS, then defaults, then NOT NULL
--   * CREATE [UNIQUE] INDEX IF NOT EXISTS
--   * FK constraints wrapped in DO/EXCEPTION duplicate_object

-- ===========================================================================
-- 1. Enums
-- ===========================================================================
DO $$ BEGIN
  CREATE TYPE "EvidencePackType" AS ENUM ('USER_KYC', 'STR_CASE', 'WALLET_RISK', 'TRAVEL_RULE', 'FULL_USER_COMPLIANCE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "EvidencePackStatus" AS ENUM ('QUEUED', 'BUILDING', 'READY', 'FAILED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "EvidencePackFormat" AS ENUM ('JSON', 'PDF_PLACEHOLDER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RetentionPolicyStatus" AS ENUM ('ACTIVE', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RetentionReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'ESCALATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceExportType" AS ENUM ('EVIDENCE_PACK', 'USER_COMPLIANCE_EXPORT', 'CASE_EXPORT', 'RETENTION_REVIEW_EXPORT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 2. compliance_evidence_packs
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_evidence_packs" (
  "id" UUID NOT NULL,
  CONSTRAINT "compliance_evidence_packs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "pack_type" "EvidencePackType";
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "status" "EvidencePackStatus";
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "format" "EvidencePackFormat";
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "scope_user_id" UUID;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "scope_case_id" UUID;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "scope_ref" TEXT;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "item_count" INTEGER;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "payload" JSONB;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "error" TEXT;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "generated_by_admin_id" UUID;
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "compliance_evidence_packs" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "format" SET DEFAULT 'JSON';
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "label" SET DEFAULT 'INTERNAL_COMPLIANCE_EVIDENCE_PACK_STAGING_ONLY';
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "item_count" SET DEFAULT 0;
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "pack_type" SET NOT NULL;
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "format" SET NOT NULL;
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "item_count" SET NOT NULL;
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "compliance_evidence_packs" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "compliance_evidence_packs_pack_type_idx" ON "compliance_evidence_packs"("pack_type");
CREATE INDEX IF NOT EXISTS "compliance_evidence_packs_status_idx" ON "compliance_evidence_packs"("status");
CREATE INDEX IF NOT EXISTS "compliance_evidence_packs_scope_user_id_created_at_idx" ON "compliance_evidence_packs"("scope_user_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "compliance_evidence_packs" ADD CONSTRAINT "compliance_evidence_packs_scope_user_id_fkey"
    FOREIGN KEY ("scope_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 3. compliance_evidence_pack_items
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_evidence_pack_items" (
  "id" UUID NOT NULL,
  CONSTRAINT "compliance_evidence_pack_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "compliance_evidence_pack_items" ADD COLUMN IF NOT EXISTS "pack_id" UUID;
ALTER TABLE "compliance_evidence_pack_items" ADD COLUMN IF NOT EXISTS "item_type" TEXT;
ALTER TABLE "compliance_evidence_pack_items" ADD COLUMN IF NOT EXISTS "ref_id" TEXT;
ALTER TABLE "compliance_evidence_pack_items" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "compliance_evidence_pack_items" ADD COLUMN IF NOT EXISTS "data" JSONB;
ALTER TABLE "compliance_evidence_pack_items" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);

ALTER TABLE "compliance_evidence_pack_items" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_evidence_pack_items" ALTER COLUMN "pack_id" SET NOT NULL;
ALTER TABLE "compliance_evidence_pack_items" ALTER COLUMN "item_type" SET NOT NULL;
ALTER TABLE "compliance_evidence_pack_items" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "compliance_evidence_pack_items" ALTER COLUMN "data" SET NOT NULL;
ALTER TABLE "compliance_evidence_pack_items" ALTER COLUMN "created_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "compliance_evidence_pack_items_pack_id_idx" ON "compliance_evidence_pack_items"("pack_id");

DO $$ BEGIN
  ALTER TABLE "compliance_evidence_pack_items" ADD CONSTRAINT "compliance_evidence_pack_items_pack_id_fkey"
    FOREIGN KEY ("pack_id") REFERENCES "compliance_evidence_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 4. record_retention_policies
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "record_retention_policies" (
  "id" UUID NOT NULL,
  CONSTRAINT "record_retention_policies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "record_retention_policies" ADD COLUMN IF NOT EXISTS "record_type" TEXT;
ALTER TABLE "record_retention_policies" ADD COLUMN IF NOT EXISTS "retention_years" INTEGER;
ALTER TABLE "record_retention_policies" ADD COLUMN IF NOT EXISTS "status" "RetentionPolicyStatus";
ALTER TABLE "record_retention_policies" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "record_retention_policies" ADD COLUMN IF NOT EXISTS "created_by_admin_id" UUID;
ALTER TABLE "record_retention_policies" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "record_retention_policies" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

ALTER TABLE "record_retention_policies" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "record_retention_policies" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "record_retention_policies" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "record_retention_policies" ALTER COLUMN "record_type" SET NOT NULL;
ALTER TABLE "record_retention_policies" ALTER COLUMN "retention_years" SET NOT NULL;
ALTER TABLE "record_retention_policies" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "record_retention_policies" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "record_retention_policies" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "record_retention_policies_record_type_key" ON "record_retention_policies"("record_type");

-- ===========================================================================
-- 5. record_retention_reviews
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "record_retention_reviews" (
  "id" UUID NOT NULL,
  CONSTRAINT "record_retention_reviews_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "policy_id" UUID;
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "record_type" TEXT;
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "status" "RetentionReviewStatus";
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "period_start" TIMESTAMP(3);
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "period_end" TIMESTAMP(3);
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "eligible_count" INTEGER;
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "retained_count" INTEGER;
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "nearing_boundary_count" INTEGER;
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "reviewed_by_admin_id" UUID;
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);
ALTER TABLE "record_retention_reviews" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

ALTER TABLE "record_retention_reviews" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "record_retention_reviews" ALTER COLUMN "eligible_count" SET DEFAULT 0;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "retained_count" SET DEFAULT 0;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "nearing_boundary_count" SET DEFAULT 0;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "record_type" SET NOT NULL;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "eligible_count" SET NOT NULL;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "retained_count" SET NOT NULL;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "nearing_boundary_count" SET NOT NULL;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "record_retention_reviews" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "record_retention_reviews_record_type_idx" ON "record_retention_reviews"("record_type");
CREATE INDEX IF NOT EXISTS "record_retention_reviews_status_idx" ON "record_retention_reviews"("status");

DO $$ BEGIN
  ALTER TABLE "record_retention_reviews" ADD CONSTRAINT "record_retention_reviews_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "record_retention_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 6. compliance_export_events
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "compliance_export_events" (
  "id" UUID NOT NULL,
  CONSTRAINT "compliance_export_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "compliance_export_events" ADD COLUMN IF NOT EXISTS "export_type" "ComplianceExportType";
ALTER TABLE "compliance_export_events" ADD COLUMN IF NOT EXISTS "pack_id" UUID;
ALTER TABLE "compliance_export_events" ADD COLUMN IF NOT EXISTS "scope_user_id" UUID;
ALTER TABLE "compliance_export_events" ADD COLUMN IF NOT EXISTS "scope_ref" TEXT;
ALTER TABLE "compliance_export_events" ADD COLUMN IF NOT EXISTS "format" TEXT;
ALTER TABLE "compliance_export_events" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "compliance_export_events" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "compliance_export_events" ADD COLUMN IF NOT EXISTS "admin_id" UUID;
ALTER TABLE "compliance_export_events" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3);

ALTER TABLE "compliance_export_events" ALTER COLUMN "label" SET DEFAULT 'INTERNAL_COMPLIANCE_EVIDENCE_PACK_STAGING_ONLY';
ALTER TABLE "compliance_export_events" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compliance_export_events" ALTER COLUMN "export_type" SET NOT NULL;
ALTER TABLE "compliance_export_events" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "compliance_export_events" ALTER COLUMN "created_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "compliance_export_events_export_type_created_at_idx" ON "compliance_export_events"("export_type", "created_at");
CREATE INDEX IF NOT EXISTS "compliance_export_events_pack_id_idx" ON "compliance_export_events"("pack_id");
CREATE INDEX IF NOT EXISTS "compliance_export_events_scope_user_id_created_at_idx" ON "compliance_export_events"("scope_user_id", "created_at");
