-- Stage 4.0 — Notifications + Email Alerts
-- Additive only: a new notifications table + supporting enums. No existing
-- table is altered and no row is rewritten.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'KYC_APPROVED',
  'KYC_REJECTED',
  'KYC_NEEDS_MORE_INFO',
  'INR_DEPOSIT_SUBMITTED',
  'INR_DEPOSIT_APPROVED',
  'INR_DEPOSIT_REJECTED',
  'WITHDRAWAL_REQUESTED',
  'WITHDRAWAL_APPROVED',
  'WITHDRAWAL_REJECTED',
  'WITHDRAWAL_COMPLETED',
  'PASSWORD_CHANGED',
  'SECURITY_SESSION_REVOKED'
);

-- CreateEnum
CREATE TYPE "NotificationEmailStatus" AS ENUM ('SENT', 'LOGGED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "email_status" "NotificationEmailStatus",
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
