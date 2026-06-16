-- Module 3 — Compliance Foundation (FIU/AML readiness, internal-only).
-- ADDITIVE ONLY. Two enums + user_risk_profiles + compliance_alerts and their
-- foreign keys. Touches no existing table's columns or constraints, so it is
-- safe to apply on a populated database. These tables hold ONLY derived risk
-- signals + metadata evidence — never PAN/Aadhaar/raw KYC documents.

-- CreateEnum
CREATE TYPE "ComplianceRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplianceAlertStatus" AS ENUM ('OPEN', 'REVIEWING', 'ESCALATED', 'CLOSED');

-- CreateTable
CREATE TABLE "user_risk_profiles" (
    "user_id" UUID NOT NULL,
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "risk_level" "ComplianceRiskLevel" NOT NULL DEFAULT 'LOW',
    "reasons" JSONB,
    "manual_override" BOOLEAN NOT NULL DEFAULT false,
    "last_evaluated_at" TIMESTAMP(3),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_risk_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "compliance_alerts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "alert_type" TEXT NOT NULL,
    "severity" "ComplianceRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "ComplianceAlertStatus" NOT NULL DEFAULT 'OPEN',
    "source_type" TEXT,
    "source_id" TEXT,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "dedupe_key" TEXT,
    "assigned_to" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_risk_profiles_risk_level_idx" ON "user_risk_profiles"("risk_level");

-- CreateIndex
CREATE INDEX "user_risk_profiles_risk_score_idx" ON "user_risk_profiles"("risk_score");

-- CreateIndex
CREATE INDEX "compliance_alerts_status_severity_idx" ON "compliance_alerts"("status", "severity");

-- CreateIndex
CREATE INDEX "compliance_alerts_user_id_created_at_idx" ON "compliance_alerts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "compliance_alerts_alert_type_created_at_idx" ON "compliance_alerts"("alert_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_alerts_dedupe_key_key" ON "compliance_alerts"("dedupe_key");

-- AddForeignKey
ALTER TABLE "user_risk_profiles" ADD CONSTRAINT "user_risk_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_risk_profiles" ADD CONSTRAINT "user_risk_profiles_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
