-- Stage 12 — federated identity (Firebase-verified Google/Apple sign-in).
--
-- Additive only. No existing table/column is altered or dropped. This sits
-- alongside the existing `oauth_accounts` table (legacy direct Google OAuth,
-- web-only, Authorization Code + PKCE) rather than replacing it: legacy rows
-- keep resolving on login for backward compatibility, and new Firebase-
-- verified logins (web, Android, iOS; Google and Apple) are recorded here.

-- CreateEnum
CREATE TYPE "FederatedIdentityProvider" AS ENUM ('GOOGLE', 'APPLE');

-- CreateTable
CREATE TABLE "user_federated_identities" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "FederatedIdentityProvider" NOT NULL,
  "provider_subject" TEXT NOT NULL,
  "firebase_uid" TEXT NOT NULL,
  "email_at_link" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "last_login_at" TIMESTAMP(3),

  CONSTRAINT "user_federated_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_federated_identities_provider_provider_subject_key" ON "user_federated_identities"("provider", "provider_subject");

-- CreateIndex
CREATE INDEX "user_federated_identities_user_id_idx" ON "user_federated_identities"("user_id");

-- AddForeignKey
ALTER TABLE "user_federated_identities" ADD CONSTRAINT "user_federated_identities_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
