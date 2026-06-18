-- Secure Admin Management (Stage 3.4B): per-admin IPv4 allowlist.
-- Empty array = no restriction (default). Enforced at login and on every admin
-- API request. Additive and safe: existing admins keep an empty allowlist.

ALTER TABLE "admins"
    ADD COLUMN "ip_allowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
