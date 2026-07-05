# FIU Technical Readiness Overview (Stage 7)

**Status: TECHNICAL-READINESS EVIDENCE — staging/demo (INR_ONLY).**

> **This is NOT FIU compliance, NOT FIU registration, NOT a legal opinion, and
> NOT production crypto readiness.** It is technical evidence — controls, logs,
> workflows, records, and documents — that supports a *future* FIU/legal review
> conducted by qualified professionals. EXORA makes **no compliance claim** here.

Scope: INR_ONLY staging/demo, **crypto globally disabled**. AWS profile
`cex-staging`, region `ap-south-1`, ECS cluster `cex-staging`.

---

## 1. What this pack is / is not

| This pack IS | This pack is NOT |
|---|---|
| Technical evidence of KYC/AML/audit/record-keeping foundations | FIU-IND registration or filing |
| A map of implemented controls → evidence sources | A legal/regulatory compliance certification |
| A readiness input for a future FIU/legal review | Proof of production or crypto readiness |
| Honest about gaps and mock/future integrations | A claim that STR/CTR filing is automated |

Legal/FIU registration, the appointment of a Principal Officer/Designated
Director, and STR/CTR filing are **legal/compliance processes handled separately
by qualified professionals** — not asserted by this technical pack.

## 2. Current technical controls (implemented, verified)

| Control | Evidence source |
|---|---|
| **KYC workflow** (submit, validate, status lifecycle) | `backend/src/modules/kyc/` (`kyc.service.ts`, `kyc.validators.ts`, `kyc.routes.ts`); tables `KycProfile`, `KycDocument`, `KycWebhookEvent` |
| **Admin KYC review** (approve/reject/resubmit, permission-gated) | `kyc.admin.routes.ts`; admin RBAC (`admin.kyc.*`) |
| **INR deposit records** (manual + gateway, maker-checker dual approval) | `backend/src/modules/deposit/`; tables `InrTransaction`, `PaymentWebhookEvent`, `BankAccount` |
| **INR withdrawal records** (lifecycle + payout reference + ledger reserve/release) | `backend/src/modules/inr-withdrawal/`; table `InrWithdrawal` |
| **Ledger / accounting records** (double-entry, append-only) | tables `LedgerTransaction`, `LedgerEntry`, `Account`, `AccountBalance`; reconciliation `ReconciliationRun`, `BalanceSnapshot` |
| **Admin audit logs** (append-only, DB trigger blocks UPDATE/DELETE) | table `AdminLog`; `backend/src/lib/audit.ts` |
| **User auth/security logs** | tables `AuditLog`, `LoginAttempt`, `AuthSession`, `EmailOtp`; action codes in `lib/audit.ts` |
| **User 2FA + step-up auth** (TOTP, backup codes, step-up before withdrawal/address change) | `backend/src/modules/user-security/`, `middleware/require-step-up.ts`; `docs/security/user-2fa-step-up-auth.md` |
| **Compliance scaffolding** (risk, screening, alerts, cases, evidence packs, retention) | `backend/src/modules/compliance/`; tables `ComplianceProfile`, `RiskAssessment`, `ScreeningCheck/Match`, `ComplianceAlert`, `ComplianceCase`, `ComplianceEvidencePack`, `RecordRetentionPolicy` |
| **Transaction monitoring engine** (detection-only; never blocks) | `compliance/monitoring.rules.ts`, `monitoring.service.ts`; `docs/compliance/transaction-monitoring-policy.md` |
| **FIU draft assembly** (draft/internal export only — never transmitted) | `compliance/fiu.service.ts`, `fiu.admin.routes.ts` |
| **Crypto global feature gates** (INR_ONLY mode; crypto OFF) | `config.featureFlags`, `feature-controls.types.ts`; see `crypto-disabled-evidence.md` |
| **180-day CloudWatch log retention** | `docs/security/log-retention-180-days.md`, `log-retention-runbook.md`; `scripts/observability/` |
| **Secrets / KMS / IAM evidence** | `docs/security/secret-inventory.md`, `kms-readiness.md`, `iam-least-privilege-readiness.md`; `scripts/security/collect-secrets-evidence.ps1` |
| **Admin edge / WAF readiness** | `docs/security/admin-edge-security-readiness.md`, `waf-readiness-plan.md` |

## 3. Gaps and future integrations (NOT implemented here)

| Gap / future work | Current state | Required before relying on it |
|---|---|---|
| **Real KYC / liveness vendor** | Mock provider (`KYC_PROVIDER=mock`, `compliance/liveness/`) | Vendor integration + contract; out of scope |
| **Sanctions / PEP / adverse-media screening** | Mock provider (`SCREENING_PROVIDER=mock`, `compliance/screening/`) | Real data provider; enable `COMPLIANCE_REQUIRE_SANCTIONS_BEFORE_APPROVAL` |
| **Transaction monitoring rules** | Detection-only engine on mock-grade data | Tuned rules + real data quality + analyst workflow |
| **STR / CTR / report filing** | Draft assembly + internal export only | **Legal/compliance process** — no filing automation claimed |
| **Compliance officer workflow** | Case/workspace scaffolding exists (`workspace.service.ts`, `ComplianceCase`) | Named Principal Officer + SOPs (legal) |
| **FIU registration / legal process** | Not in scope of any code | Qualified professionals, separately |
| **Travel Rule** | Scaffolding only (`travel-rule.service.ts`, crypto-only) | Only if crypto transfers are ever enabled (currently OFF) |

## 4. How to use this pack

Start at `fiu-evidence-pack/README.md`, then the control matrix
(`fiu-technical-control-matrix.md`). Workflow and monitoring detail are in
`kyc-aml-technical-workflow.md` and `transaction-monitoring-readiness.md`.
Evidence collection: `scripts/compliance/collect-fiu-technical-evidence.ps1`
(read-only). Crypto-off proof: `crypto-disabled-evidence.md`. Existing policy
docs (KYC, AML/CFT, screening, monitoring, retention, INR-only) live in
`docs/compliance/` and are referenced rather than duplicated.

---

**Reminder:** no compliance/legal/production-crypto claim is made. This is
technical readiness evidence for a future review.
