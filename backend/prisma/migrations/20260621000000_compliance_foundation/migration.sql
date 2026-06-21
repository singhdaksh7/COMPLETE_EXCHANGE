-- Stage 5.0 — Compliance Foundation + Enhanced KYC/Liveness
-- Additive only: new enums + four compliance tables, plus three new
-- NotificationType values. No existing table is altered or rewritten, and no
-- compliance data is ever deleted (record-retention baseline).

-- ---------------------------------------------------------------------------
-- New NotificationType values (additive; safe to re-run with IF NOT EXISTS).
-- ---------------------------------------------------------------------------
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'KYC_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'KYC_LIVENESS_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMPLIANCE_REVIEW_COMPLETED';

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'BUSINESS');
CREATE TYPE "ComplianceRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'PROHIBITED');
CREATE TYPE "ComplianceKycStatus" AS ENUM (
  'NOT_STARTED', 'DRAFT', 'SUBMITTED', 'NEEDS_MORE_INFO',
  'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'
);
CREATE TYPE "GeoCaptureStatus" AS ENUM ('NOT_CAPTURED', 'CAPTURED', 'PARTIAL', 'UNAVAILABLE');
CREATE TYPE "LivenessStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'PASSED', 'FAILED', 'REVIEW_REQUIRED');
CREATE TYPE "ScreeningStatus" AS ENUM ('NOT_SCREENED', 'PENDING', 'CLEAR', 'HIT', 'REVIEW_REQUIRED');
CREATE TYPE "ComplianceEvidenceType" AS ENUM (
  'PAN', 'AADHAAR', 'SELFIE', 'LIVENESS', 'ADDRESS',
  'GEOLOCATION', 'DEVICE', 'CONSENT', 'PROVIDER_RESPONSE'
);
CREATE TYPE "ComplianceEvidenceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'INFO');
CREATE TYPE "ConsentType" AS ENUM (
  'KYC_PROCESSING', 'AML_SCREENING', 'DATA_RETENTION', 'TERMS_ACCEPTANCE', 'RISK_DISCLOSURE'
);
CREATE TYPE "RiskAssessmentSource" AS ENUM ('KYC', 'TRANSACTION', 'ADMIN', 'SCREENING', 'SYSTEM');

-- ---------------------------------------------------------------------------
-- compliance_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE "compliance_profiles" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "customer_type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
  "status" "ComplianceKycStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "full_name" TEXT,
  "date_of_birth" DATE,
  "nationality" TEXT,
  "country_of_residence" TEXT,
  "address_line1" TEXT,
  "address_line2" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postal_code" TEXT,
  "country" TEXT,
  "pan_last4" TEXT,
  "pan_masked" TEXT,
  "pan_enc" BYTEA,
  "aadhaar_last4" TEXT,
  "aadhaar_masked" TEXT,
  "aadhaar_ref_enc" BYTEA,
  "risk_level" "ComplianceRiskLevel" NOT NULL DEFAULT 'MEDIUM',
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "risk_reason" TEXT,
  "onboarding_ip" TEXT,
  "onboarding_country" TEXT,
  "onboarding_region" TEXT,
  "onboarding_city" TEXT,
  "onboarding_latitude" TEXT,
  "onboarding_longitude" TEXT,
  "onboarding_user_agent" TEXT,
  "geo_capture_status" "GeoCaptureStatus" NOT NULL DEFAULT 'NOT_CAPTURED',
  "liveness_status" "LivenessStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "liveness_provider" TEXT,
  "liveness_reference" TEXT,
  "liveness_score" INTEGER,
  "sanctions_status" "ScreeningStatus" NOT NULL DEFAULT 'NOT_SCREENED',
  "pep_status" "ScreeningStatus" NOT NULL DEFAULT 'NOT_SCREENED',
  "adverse_media_status" "ScreeningStatus" NOT NULL DEFAULT 'NOT_SCREENED',
  "kyc_provider" TEXT,
  "kyc_provider_reference" TEXT,
  "consent_version" TEXT,
  "compliance_note" TEXT,
  "verified_at" TIMESTAMP(3),
  "reviewed_by_admin_id" UUID,
  "last_reviewed_at" TIMESTAMP(3),
  "next_review_due_at" TIMESTAMP(3),
  "retention_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "compliance_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compliance_profiles_user_id_key" ON "compliance_profiles"("user_id");
CREATE INDEX "compliance_profiles_status_idx" ON "compliance_profiles"("status");
CREATE INDEX "compliance_profiles_risk_level_idx" ON "compliance_profiles"("risk_level");
CREATE INDEX "compliance_profiles_next_review_due_at_idx" ON "compliance_profiles"("next_review_due_at");

ALTER TABLE "compliance_profiles" ADD CONSTRAINT "compliance_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_profiles" ADD CONSTRAINT "compliance_profiles_reviewed_by_admin_id_fkey"
  FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- compliance_evidence
-- ---------------------------------------------------------------------------
CREATE TABLE "compliance_evidence" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "ComplianceEvidenceType" NOT NULL,
  "status" "ComplianceEvidenceStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "reference_id" TEXT,
  "storage_key" TEXT,
  "document_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by_admin_id" UUID,

  CONSTRAINT "compliance_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_evidence_user_id_type_idx" ON "compliance_evidence"("user_id", "type");
CREATE INDEX "compliance_evidence_user_id_created_at_idx" ON "compliance_evidence"("user_id", "created_at");

ALTER TABLE "compliance_evidence" ADD CONSTRAINT "compliance_evidence_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_evidence" ADD CONSTRAINT "compliance_evidence_reviewed_by_admin_id_fkey"
  FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- compliance_consents
-- ---------------------------------------------------------------------------
CREATE TABLE "compliance_consents" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "consent_type" "ConsentType" NOT NULL,
  "version" TEXT NOT NULL,
  "ip" TEXT,
  "user_agent" TEXT,
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "compliance_consents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_consents_user_id_consent_type_idx" ON "compliance_consents"("user_id", "consent_type");

ALTER TABLE "compliance_consents" ADD CONSTRAINT "compliance_consents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- risk_assessments
-- ---------------------------------------------------------------------------
CREATE TABLE "risk_assessments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "score" INTEGER NOT NULL,
  "level" "ComplianceRiskLevel" NOT NULL,
  "reasons" JSONB NOT NULL,
  "source" "RiskAssessmentSource" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_admin_id" UUID,

  CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "risk_assessments_user_id_created_at_idx" ON "risk_assessments"("user_id", "created_at");

ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_created_by_admin_id_fkey"
  FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
