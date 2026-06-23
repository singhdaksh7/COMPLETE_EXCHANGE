-- Stage 3A — Passwordless email-OTP login/signup.
--
-- Additive only: 1 new enum + 1 new table (email_otps). No existing table is
-- altered. The OTP code is never stored — only a keyed HMAC hash.
--
-- Idempotent / repair-safe:
--   * enum create wrapped in DO/EXCEPTION duplicate_object
--   * CREATE TABLE IF NOT EXISTS with only the id PK, then ADD COLUMN IF NOT EXISTS
--   * CREATE INDEX IF NOT EXISTS

DO $$ BEGIN
  CREATE TYPE "EmailOtpPurpose" AS ENUM ('LOGIN', 'SIGNUP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "email_otps" (
  "id" UUID NOT NULL,
  CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "email" CITEXT;
ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "otp_hash" TEXT;
ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "purpose" "EmailOtpPurpose";
ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);
ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "used_at" TIMESTAMP(3);
ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "max_attempts" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "ip_address" INET;
ALTER TABLE "email_otps" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;

-- Required columns must be NOT NULL (set after backfill-safe defaults above).
ALTER TABLE "email_otps" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "email_otps" ALTER COLUMN "otp_hash" SET NOT NULL;
ALTER TABLE "email_otps" ALTER COLUMN "purpose" SET NOT NULL;
ALTER TABLE "email_otps" ALTER COLUMN "expires_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "email_otps_email_created_at_idx" ON "email_otps"("email", "created_at");
CREATE INDEX IF NOT EXISTS "email_otps_expires_at_idx" ON "email_otps"("expires_at");
