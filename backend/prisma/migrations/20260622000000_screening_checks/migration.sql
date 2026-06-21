-- Stage 5.1 — Sanctions / PEP / Adverse Media Screening
-- Additive only: three new enums + two new tables (screening_checks,
-- screening_matches). No existing table is altered, rewritten, or deleted, and
-- screening records are never auto-deleted (record-retention baseline).

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------
CREATE TYPE "ScreeningCheckStatus" AS ENUM ('PENDING', 'CLEAR', 'POSSIBLE_MATCH', 'FAILED', 'ERROR');
CREATE TYPE "ScreeningCategory" AS ENUM ('SANCTIONS', 'PEP', 'ADVERSE_MEDIA');
CREATE TYPE "ScreeningDecision" AS ENUM ('APPROVED', 'REJECTED', 'NEEDS_REVIEW', 'FALSE_POSITIVE');

-- ---------------------------------------------------------------------------
-- screening_checks
-- ---------------------------------------------------------------------------
CREATE TABLE "screening_checks" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "category" "ScreeningCategory" NOT NULL,
  "status" "ScreeningCheckStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT NOT NULL,
  "provider_mode" TEXT NOT NULL,
  "provider_reference" TEXT,
  "score" INTEGER NOT NULL DEFAULT 0,
  "summary" TEXT,
  "decision" "ScreeningDecision",
  "decision_note" TEXT,
  "decided_by_admin_id" UUID,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "screening_checks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "screening_checks_user_id_created_at_idx" ON "screening_checks"("user_id", "created_at");
CREATE INDEX "screening_checks_user_id_category_idx" ON "screening_checks"("user_id", "category");
CREATE INDEX "screening_checks_batch_id_idx" ON "screening_checks"("batch_id");

ALTER TABLE "screening_checks" ADD CONSTRAINT "screening_checks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "screening_checks" ADD CONSTRAINT "screening_checks_decided_by_admin_id_fkey"
  FOREIGN KEY ("decided_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- screening_matches
-- ---------------------------------------------------------------------------
CREATE TABLE "screening_matches" (
  "id" UUID NOT NULL,
  "check_id" UUID NOT NULL,
  "category" "ScreeningCategory" NOT NULL,
  "name" TEXT NOT NULL,
  "match_score" INTEGER NOT NULL DEFAULT 0,
  "list_name" TEXT,
  "source_url" TEXT,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "screening_matches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "screening_matches_check_id_idx" ON "screening_matches"("check_id");

ALTER TABLE "screening_matches" ADD CONSTRAINT "screening_matches_check_id_fkey"
  FOREIGN KEY ("check_id") REFERENCES "screening_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
