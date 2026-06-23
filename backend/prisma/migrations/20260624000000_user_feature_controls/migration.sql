-- Stage 7.x — Per-user operational feature controls (User Control Center)
--
-- Additive only: 1 new table (user_feature_controls). No existing table is
-- altered, rewritten, or deleted. Nothing here moves money or relaxes an
-- existing compliance / KYC / risk check; the controls can only add further
-- per-user restrictions enforced in the user-facing APIs.
--
-- IDEMPOTENT / REPAIR-SAFE (same strategy as Stage 5.x):
--   * CREATE TABLE IF NOT EXISTS with only the id PK
--   * columns via ADD COLUMN IF NOT EXISTS, then defaults / NOT NULL
--   * CREATE [UNIQUE] INDEX IF NOT EXISTS
--   * FK constraint wrapped in DO/EXCEPTION duplicate_object

CREATE TABLE IF NOT EXISTS "user_feature_controls" (
  "id" UUID NOT NULL,
  CONSTRAINT "user_feature_controls_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "user_id" UUID;

-- Trading controls
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "can_trade_spot" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "can_place_buy_orders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "can_place_sell_orders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "can_cancel_orders" BOOLEAN NOT NULL DEFAULT true;

-- INR controls
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "can_deposit_inr" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "can_withdraw_inr" BOOLEAN NOT NULL DEFAULT true;

-- Crypto controls
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "can_deposit_crypto" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "can_withdraw_crypto" BOOLEAN NOT NULL DEFAULT true;

-- Compliance controls
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "force_kyc_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "require_enhanced_kyc" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "under_compliance_review" BOOLEAN NOT NULL DEFAULT false;

-- Risk controls
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "block_high_risk_activity" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "manual_review_before_withdrawal" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "updated_by_admin_id" UUID;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "user_feature_controls" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- user_id must be present + unique (one row per user).
ALTER TABLE "user_feature_controls" ALTER COLUMN "user_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "user_feature_controls_user_id_key" ON "user_feature_controls"("user_id");

DO $$ BEGIN
  ALTER TABLE "user_feature_controls"
    ADD CONSTRAINT "user_feature_controls_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
