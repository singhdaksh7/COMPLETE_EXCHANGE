-- KYC: generic third-party provider abstraction (Phase 1)
-- Adds normalized provider linkage + outcome fields to kyc_profiles, two new
-- KycStatus states, a KycCheckStatus enum, and an idempotent webhook table.
-- NOTE: ALTER TYPE ... ADD VALUE requires PostgreSQL 12+ inside a transaction.

-- AlterEnum: new KYC lifecycle states (provider-driven / manual fallback)
ALTER TYPE "KycStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW' BEFORE 'APPROVED';
ALTER TYPE "KycStatus" ADD VALUE IF NOT EXISTS 'MANUAL_REVIEW' BEFORE 'APPROVED';

-- CreateEnum: normalized per-check status
CREATE TYPE "KycCheckStatus" AS ENUM ('PENDING', 'PASS', 'FAIL', 'UNAVAILABLE');

-- AlterTable: generic provider linkage + normalized outcome on kyc_profiles
ALTER TABLE "kyc_profiles"
    ADD COLUMN "provider_session_id" TEXT,
    ADD COLUMN "provider_applicant_id" TEXT,
    ADD COLUMN "pan_masked" TEXT,
    ADD COLUMN "aadhaar_masked" TEXT,
    ADD COLUMN "liveness_status" "KycCheckStatus",
    ADD COLUMN "document_status" "KycCheckStatus",
    ADD COLUMN "risk_score" INTEGER;

-- CreateIndex: attribute inbound webhooks/polls back to a profile
CREATE INDEX "kyc_profiles_provider_session_id_idx" ON "kyc_profiles"("provider_session_id");
CREATE INDEX "kyc_profiles_provider_applicant_id_idx" ON "kyc_profiles"("provider_applicant_id");

-- CreateTable: append-only, idempotent KYC provider webhook events
CREATE TABLE "kyc_webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "signature_ok" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: idempotency guard (process each vendor event at most once)
CREATE UNIQUE INDEX "kyc_webhook_events_provider_provider_event_id_key" ON "kyc_webhook_events"("provider", "provider_event_id");

-- CreateIndex: unprocessed-event lookup
CREATE INDEX "kyc_webhook_events_processed_at_idx" ON "kyc_webhook_events"("processed_at");
