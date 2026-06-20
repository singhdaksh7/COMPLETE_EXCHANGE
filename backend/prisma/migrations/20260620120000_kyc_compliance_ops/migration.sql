-- Stage 3.9 — Advanced KYC Review + Compliance Operations
-- Additive only: a new KYC status value + an internal compliance note column.
-- Neither change alters existing rows or gating behaviour (NEEDS_MORE_INFO is
-- non-approved, so all `=== APPROVED` gates continue to block as before).

-- 1. New KYC status used by the admin "request more information" action.
ALTER TYPE "KycStatus" ADD VALUE IF NOT EXISTS 'NEEDS_MORE_INFO';

-- 2. Internal, admin-only compliance note on the KYC profile. Nullable; never
--    surfaced on any user-facing API/DTO.
ALTER TABLE "kyc_profiles" ADD COLUMN IF NOT EXISTS "compliance_note" TEXT;
