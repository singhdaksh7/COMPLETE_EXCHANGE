-- Phase 5.3 — KYC provider abstraction. ADDITIVE ONLY: two nullable columns on
-- kyc_profiles to track the third-party verification provider's normalized
-- status and last update time. `provider` + `provider_ref` already exist. No
-- backfill, no constraint changes — safe to apply on a populated database.

-- AlterTable
ALTER TABLE "kyc_profiles" ADD COLUMN     "provider_status" TEXT,
ADD COLUMN     "provider_updated_at" TIMESTAMP(3);
