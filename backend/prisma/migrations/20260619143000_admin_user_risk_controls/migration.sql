CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

ALTER TABLE "users"
  ADD COLUMN "withdrawals_blocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "risk_level" "RiskLevel" NOT NULL DEFAULT 'LOW',
  ADD COLUMN "risk_note" TEXT;

CREATE INDEX "users_withdrawals_blocked_idx" ON "users"("withdrawals_blocked");
CREATE INDEX "users_risk_level_idx" ON "users"("risk_level");
