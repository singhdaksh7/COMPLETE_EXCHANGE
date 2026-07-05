# Transaction Monitoring Readiness (Stage 7)

**Status: TECHNICAL-READINESS PLAN — staging/demo (INR_ONLY). Not a compliance
claim.**

> **No automated STR filing is implemented. No FIU reporting automation is
> claimed.** A detection-only monitoring engine exists on mock-grade staging
> data; everything below is a technical readiness plan, not a compliance control.

Policy intent: `docs/compliance/transaction-monitoring-policy.md`,
`aml-cft-policy.md`.

---

## 1. Technical data already available for monitoring

| Signal | Source (table / log / service) |
|---|---|
| INR deposits | `InrTransaction`, `PaymentWebhookEvent` (`deposit.service.ts`) |
| INR withdrawals | `InrWithdrawal` (`inr-withdrawal.service.ts`) |
| Ledger entries (money truth) | `LedgerTransaction`, `LedgerEntry` |
| User accounts / balances | `Account`, `AccountBalance`, `BalanceSnapshot` |
| KYC status / tier | `KycProfile`, `ComplianceProfile`, `RiskAssessment` |
| Admin actions | `AdminLog` (append-only) |
| Auth / IP signals | `AuditLog`, `LoginAttempt`, `AuthSession` (IP/user-agent on requests) |
| Failed login / lockout | `LoginAttempt`, `AuditLog` (`auth.login_failed`, `auth.login_locked`) |
| Withdrawal step-up auth | `require-step-up.ts` events; `AuditLog` |
| Screening results | `ScreeningCheck`, `ScreeningMatch` (mock provider) |
| Existing alerts / cases | `ComplianceAlert`, `ComplianceCase` (`monitoring.service.ts`) |

## 2. Existing detection-only engine (implemented, not a filing system)

`compliance/monitoring.rules.ts` + `monitoring.service.ts` already evaluate
heuristics over the windowed data and create `ComplianceAlert`/`ComplianceCase`
rows. It is **detection-only**: it never blocks trading/withdrawals, runs on
mock-grade staging data, and does not file anything. Existing rule themes include
structuring, abnormal volume, repeated failed withdrawals, and rapid
deposit→withdrawal correlation (thresholds via `COMPLIANCE_MONITORING_*` env).

## 3. Proposed future rules (NOT implemented in this stage)

| Proposed rule | Data it would use | Notes |
|---|---|---|
| High-frequency withdrawal attempts | `InrWithdrawal` velocity per user/window | Tune threshold; analyst review |
| Repeated failed KYC | `KycProfile` status history, `KycWebhookEvent` | Needs real vendor outcomes |
| Deposit / withdrawal velocity | `InrTransaction` + `InrWithdrawal` per window | Per-user + per-identifier |
| Multiple accounts, shared identifiers | `User` (email/phone/PAN ref), `BankAccount` | Identity-cluster detection |
| Unusual login geography / device | `LoginAttempt`, request IP/UA | Requires geo/device enrichment (future) |
| Manual payout mismatch | `InrWithdrawal` payout ref vs `LedgerEntry` | Reconciliation-driven |
| Admin override review | `AdminLog` sensitive actions | Maker-checker exceptions |
| Crypto transfer risk checks | `WalletRiskProfile/Check`, `TravelRuleTransfer` | **Future, crypto-only** — crypto is OFF |

> These are proposals. Implementing them requires tuned thresholds, real data
> quality, and a documented analyst workflow — none added in this stage.

## 4. Hard limits of the current state

- **Mock-grade data:** screening/KYC are mock; alert quality is illustrative.
- **No blocking:** monitoring is advisory; it never stops money movement.
- **No STR/CTR filing automation:** drafts can be assembled (`fiu.service.ts`),
  but filing is a **legal/compliance process** done by qualified professionals.
- **Crypto signals dormant:** wallet-risk/Travel-Rule scaffolding is inert while
  crypto is globally disabled.

---

**This is a technical readiness plan.** No new rules, vendors, or filing
automation are implemented here.
