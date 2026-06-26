-- Stage 15 — Compliance feature controls.
--
-- Two changes to user_feature_controls, both additive / repair-safe:
--   1. New column can_access_crypto_wallet (default false) — gates the crypto
--      wallet surface independently of deposit/withdrawal.
--   2. Flip the column DEFAULT for the crypto deposit/withdraw flags to false so
--      brand-new control rows start with crypto OFF (compliance posture). This
--      changes only the DEFAULT for FUTURE inserts; existing rows keep their
--      stored values. Effective crypto access is also gated by the global
--      CRYPTO_*_GLOBAL_ENABLED flags (config), which are off in staging, so this
--      never relaxes an existing check — it only tightens new-user defaults.
--
-- No money movement, no data rewrite, nothing deleted.

ALTER TABLE "user_feature_controls"
  ADD COLUMN IF NOT EXISTS "can_access_crypto_wallet" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "user_feature_controls"
  ALTER COLUMN "can_deposit_crypto" SET DEFAULT false;

ALTER TABLE "user_feature_controls"
  ALTER COLUMN "can_withdraw_crypto" SET DEFAULT false;
