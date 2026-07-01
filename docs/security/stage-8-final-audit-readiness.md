# Stage 8 — Final Audit Readiness Overview

**Status: STAGING / DEMO CYBERSECURITY + FIU TECHNICAL READINESS.**
**Mode: INR_ONLY. Crypto globally disabled.**

> This document is the top-level map of what a cybersecurity auditor / VAPT
> tester / FIU technical reviewer needs to review EXORA staging safely. It
> consolidates Stages 4–7B and freezes the staging security posture for audit.

---

## 1. Scope (and non-scope)

**In scope**

- Cybersecurity / VAPT readiness of the **staging/demo** platform
  (`https://www.exorain.com`) in **INR_ONLY** mode.
- FIU **technical** readiness evidence (controls, records, exportability).
- Verification that intentionally-disabled surfaces (crypto) stay disabled.

**Explicitly NOT in scope / NOT claimed**

- ❌ Not a production launch or production-readiness certification.
- ❌ Not an FIU **legal/compliance** certification (registration, Principal
  Officer, legal opinion are handled by qualified professionals).
- ❌ Not production **crypto** readiness (custody / signing / reconciliation).
- ❌ Not an independent VAPT sign-off — this pack *prepares for* one.

Authoritative blocker list: [`../compliance/production-blockers.md`](../compliance/production-blockers.md).

## 2. Live platform mode

- **PLATFORM_MODE = INR_ONLY.** No crypto custody, no on-chain settlement, no
  Travel-Rule obligations active.
- All `CRYPTO_*_GLOBAL_ENABLED` flags are **false**. Effective access is
  `globalFlag && userFlag`, so per-user crypto toggles are inert while the global
  is off. Evidence: [`../compliance/crypto-disabled-evidence.md`](../compliance/crypto-disabled-evidence.md).
- Stage 5 production boot guard refuses to boot real production with any
  `CRYPTO_*_GLOBAL_ENABLED=true` unless `CRYPTO_PRODUCTION_READINESS_ACK=true`
  (`backend/src/lib/prod-safety.ts`). Staging (`APP_ENV=staging`) is unaffected.

## 3. Currently deployed security controls

Each control below is implemented and deployed on staging. Evidence source in the
control matrix ([`final-security-control-matrix.md`](./final-security-control-matrix.md))
and the FIU / edge / secrets docs.

| # | Control | Where / evidence |
|---|---|---|
| 1 | **Admin TOTP encryption** (AES-256-GCM at rest) | admin 2FA; `secret-inventory.md` |
| 2 | **Admin login lockout** (failed-attempt throttling/lock) | `admin-access-runbook.md`, `admin-endpoint-safe-checks.md` |
| 3 | **User 2FA** (TOTP enroll/confirm/disable, hashed backup codes, login enforcement) | `user-2fa-step-up-auth.md` |
| 4 | **Withdrawal step-up auth** (fresh TOTP/backup → 5-min single-use token) | `user-2fa-step-up-auth.md` |
| 5 | **KYC upload validation** (MIME + size validation) | `../compliance/kyc-aml-technical-workflow.md` |
| 6 | **Admin RBAC** (Bearer + role checks, per-admin IP allowlist at app layer) | `admin-access-runbook.md`, `../compliance/admin-rbac-audit-policy.md` |
| 7 | **Admin lifecycle / deactivation** (soft-deactivate only; no hard delete) | Stage 7A; `admin-access-runbook.md` |
| 8 | **Admin activity timeline** (traceable approvals/actions) | Stage 7A |
| 9 | **Single active user session** (previous session revoked → `SESSION_REVOKED_BY_NEW_LOGIN`) | `user-session-security.md` |
| 10 | **Login location requirement** (`REQUIRE_LOGIN_LOCATION` / `LOCATION_REQUIRED`, consented) | `user-session-security.md` |
| 11 | **Real alerts / no fake data** (Stage 7B removed fake profile/trading/security data) | `user-session-security.md`; Stage 8 §Fake-data scan |
| 12 | **CORS / custom domain readiness** (strict allowlist; deploy-time origin fix flagged) | `production-blockers.md` #10e |
| 13 | **CloudWatch 180-day retention** (documented + verifiable) | `log-retention-180-days.md`, `log-retention-runbook.md` |
| 14 | **CloudWatch alarms** (5xx, DB errors, auth-fail, ECS/ALB health, latency, 404) | `cloudwatch-alarms-plan.md`, `alert-runbook.md` |
| 15 | **Secrets / KMS / IAM evidence** (inventory + rotation runbook + read-only script) | `secret-inventory.md`, `kms-readiness.md`, `iam-least-privilege-readiness.md` |
| 16 | **WAF / admin edge readiness docs** (plan + dry-run script) | `waf-readiness-plan.md`, `admin-edge-security-readiness.md` |
| 17 | **FIU technical evidence docs** | `../compliance/fiu-evidence-pack/README.md` |

## 4. Intentionally disabled (by design)

- Crypto deposits, withdrawals, and wallet surfaces (global flags off).
- Live withdrawal signing (`WITHDRAWAL_SIGNER=live` unimplemented; mock holds no keys).
- These are **controls**, not gaps — see `crypto-disabled-evidence.md`.

## 5. Remaining blockers (not closed by Stage 8)

These remain open and are **not** claimed as done. Full detail + classification in
[`../compliance/production-blockers.md`](../compliance/production-blockers.md).

| Area | Blocker | Class |
|---|---|---|
| KYC | Real KYC / liveness vendor (mock today) | BLOCKER (FIU onboarding) |
| Screening | Sanctions / PEP / adverse-media provider (mock today) | BLOCKER (FIU onboarding) |
| Monitoring | Transaction-monitoring rules tuned on real data + analyst SOP | HIGH |
| Logging | SIEM / tamper-resistant logging (CloudWatch alarms are best-effort, not SIEM) | HIGH |
| Secrets | KMS CMK + secrets rotation | HIGH |
| Edge | Tuned WAF rules associated to the actual serving edge (Vercel/CloudFront) | HIGH |
| Session | Idle/inactivity session timeout (absolute expiry exists; idle missing) | MEDIUM |
| Audit | Audit hash-chain columns reserved but not populated | MEDIUM |
| Backup | RDS automated backup retention at staging default (1 day) | MEDIUM (staging accepted) |
| Legal | FIU registration + named officer (out of scope of any code) | BLOCKER (legal) |
| Crypto | Production crypto custody / signing / reconciliation | BLOCKER (crypto launch) |

> **Live-behavior notes at freeze time:** login location requirement is ON;
> single active user session is ON; fake profile/trading/security data removed;
> admin delete is soft-deactivate only; crypto deposit/withdrawal/wallet OFF.

## 6. How an auditor reviews this safely

1. Read this doc → [`vapt-scope.md`](./vapt-scope.md) (in/out of scope + rules of engagement).
2. Work the [`vapt-evidence-checklist.md`](./vapt-evidence-checklist.md) and
   [`final-security-control-matrix.md`](./final-security-control-matrix.md).
3. Run the read-only evidence script
   `scripts/security/collect-final-audit-evidence.ps1` and attach its output.
4. Use [`final-smoke-test-runbook.md`](./final-smoke-test-runbook.md) for manual UI verification.
5. Package with [`final-evidence-pack/README.md`](./final-evidence-pack/README.md).

**Rules of engagement:** no destructive testing, no DDoS/load, no social
engineering/phishing, no AWS/IAM takeover attempts, no real money-movement abuse,
no crypto enablement, no wallet/private-key testing. See `vapt-scope.md`.

---

**This is a staging audit-freeze package. It does not claim production, FIU legal,
or production-crypto readiness.**
