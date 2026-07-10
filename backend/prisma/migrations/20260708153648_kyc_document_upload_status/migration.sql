-- Stage 10B — track KYC document upload confirmation separately from
-- KycDocument.status (which is the review/lifecycle status, mirroring
-- KycStatus and cascaded on admin APPROVE/REJECT decisions).
--
-- Additive only. No table is dropped, no existing row is deleted. The new
-- column has a NOT NULL default so every existing row backfills safely to
-- 'REGISTERED' — the conservative choice: no document's bytes can be assumed
-- to have reached real object storage before this migration, since the prior
-- presigned-upload implementation pointed at a non-routable stub host.

-- CreateEnum
CREATE TYPE "KycDocumentUploadStatus" AS ENUM ('REGISTERED', 'UPLOADED', 'FAILED');

-- AlterTable
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "upload_status" "KycDocumentUploadStatus" NOT NULL DEFAULT 'REGISTERED';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kyc_documents_upload_status_idx" ON "kyc_documents"("upload_status");
