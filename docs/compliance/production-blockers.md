# Production Blockers — Final Register (Stage 8)

**Mode: INR_ONLY staging/demo. Crypto globally disabled.**

The single source of truth for what MUST be closed before EXORA serves real
users / real money, and before crypto is ever re-enabled. This register is
auditor-readable and **makes no claim of production readiness**. Referenced by
the Stage 8 security pack (`docs/security/stage-8-final-audit-readiness.md`).

## Classification

| Class | Meaning |
|---|---|
| **BLOCKER** | Must be closed before the relevant launch (production / crypto / FIU). Hard stop. |
| **HIGH** | Important hardening; close before production, not a staging-demo stopper. |
| **MEDIUM** | Should be closed; moderate risk. |
| **LOW** | Minor / cosmetic hardening. |
| **DOCUMENTED GAP** | Known limitation, described and bounded; not yet remediated. |
| **STAGING ACCEPTED RISK** | Accepted for the staging/demo environment only; unacceptable for production. |

Progress: ❌ not started · 🟡 partial/mock/abstraction · ✅ done.

---

## 1. Production launch blockers

| # | Item | Class | Status | Evidence / notes |
|---|---|---|---|---|
| 11 | Infrastructure-as-Code (VPC/SG, private DB/S3, RDS/EBS/S3 encryption) | BLOCKER | ❌ | No IaC in repo; configure + codify. |
| 12a | RDS automated backup retention raised from staging default | HIGH | ❌ | Prod must be 7–35 days PITR; verify `BackupRetentionPeriod`. Also a staging accepted risk (§5). |
| 13 | Centralized SIEM / tamper-resistant log storage | HIGH | ❌ | CloudWatch alarms are **best-effort, not a SIEM**. `docs/security/cloudwatch-alarms-plan.md`. |
| 14 | 180-day ICT log retention enforced in IaC + time-sync (NTP) | HIGH | 🟡 | Steps documented (`log-retention-180-days.md`); not enforced in IaC. |
| 3 | Admin/user idle (inactivity) session timeout | MEDIUM | 🟡 | Absolute expiry exists; idle timeout missing. |
| 16 | Audit hash-chain populated (`prev_hash`/`row_hash`) | MEDIUM | ❌ | Columns reserved; append-only enforced today. CERT-In evidence integrity. |
| 17 | Independent VAPT by a CERT-In empanelled auditor | BLOCKER | ❌ | This pack prepares for it: `docs/security/final-evidence-pack/README.md`. |
| 18 | Dependency / SAST / secret scanning enforced (blocking) | HIGH | 🟡 | CI scans report-only (`.github/workflows/security-scans.yml`); flip to blocking after baseline. |
| 12 | Backup automation + tested restore + DR/BCP | HIGH | 🟡 | Drill checklist exists (`backup-restore-drill.md`); not executed. |
| 15 | Incident response operationalized (named contacts, drills) | MEDIUM | 🟡 | Process defined (`cert-in-incident-response.md`); not drilled. |

## 2. Crypto launch blockers

> **Do not enable crypto.** All items below are required before any
> `CRYPTO_*_GLOBAL_ENABLED=true`. Evidence of the disabled state:
> `docs/compliance/crypto-disabled-evidence.md`.

| # | Item | Class | Status | Evidence / notes |
|---|---|---|---|---|
| 19 | Independent wallet / signer audit | BLOCKER | ❌ | Live signing disabled until complete. |
| 20 | Blockchain-to-ledger reconciliation | BLOCKER | ❌ | Required before crypto is re-enabled. |
| 21 | No crypto private keys in app env (HSM/KMS/signer-service design first) | BLOCKER | ❌ (policy enforced) | No key/mnemonic in any env var, Secrets Manager string the app reads, `.env`, or repo. `secret-inventory.md` §3, `kms-readiness.md` §10. |
| 22 | Crypto-global production boot guard | BLOCKER (gate) | ✅ | Prod refuses to boot with any `CRYPTO_*_GLOBAL_ENABLED=true` unless `CRYPTO_PRODUCTION_READINESS_ACK=true` (`backend/src/lib/prod-safety.ts`). Safety latch, **not** approval. |

> No production crypto until reconciliation (#20), custody + signing (#19, #21),
> monitoring (#13), and compliance/licensing are all approved.

## 3. FIU / legal blockers

| # | Item | Class | Status | Evidence / notes |
|---|---|---|---|---|
| 4 | Real KYC / liveness provider | BLOCKER | 🟡 | Mock providers only; real vendor + AV scan needed. |
| 5 | Malware/AV scan + real object storage for uploads | BLOCKER | ❌ | Upload is a stub; MIME+size validation implemented. |
| 6 | Real sanctions / PEP / adverse-media provider | BLOCKER | 🟡 | Mock screening; enable require-sanctions gate in prod. |
| 7 | Enable compliance risk gates (default permissive in staging) | HIGH | 🟡 | `COMPLIANCE_REQUIRE_*` flags. |
| 8 | FIU manual reporting procedure (no automation) | HIGH | 🟡 | Draft-only assembly exists; filing stays manual. |
| 8b | Tuned transaction-monitoring rules on real data + analyst SOP | HIGH | 🟡 | Detection-only engine exists (`compliance/monitoring.rules.ts`); needs real data, tuned thresholds, named officer. `transaction-monitoring-readiness.md`. |
| 8c | FIU registration + named Principal Officer/Designated Director | BLOCKER | ❌ | **Legal/compliance process — out of scope of any code.** Handled by qualified professionals. |
| 8a | FIU **technical-readiness** evidence pack (not compliance) | DOCUMENTED GAP → ✅ | ✅ | Stage 7 pack (`fiu-evidence-pack/README.md`). Documents technical controls only; makes no FIU/legal/compliance claim. |

## 4. Security hardening gaps

| # | Item | Class | Status | Evidence / notes |
|---|---|---|---|---|
| 9 | KMS CMK for production secrets | BLOCKER (prod) | ❌ | KYC PII + all 2FA seeds use one key derived from `KYC_ENCRYPTION_KEY` today. `kms-readiness.md` (`alias/exora/prod/secrets`). |
| 12e | Split `TOTP_ENCRYPTION_KEY` from `KYC_ENCRYPTION_KEY` | HIGH | ❌ | One key seals KYC PII **and** all user/admin TOTP seeds — large blast radius. |
| 12b | Secrets rotation policy | HIGH | ❌ | No rotation today. `secrets-rotation-runbook.md`; `collect-secrets-evidence.ps1`. |
| 12c | IAM least-privilege review of ECS task/execution roles | HIGH | ❌ | Scope per service; no wildcard `secretsmanager:*`/`kms:Decrypt *`. `iam-least-privilege-readiness.md`. |
| 12d | Production secrets via Secrets Manager (not plaintext env) under CMK | HIGH | 🟡 | `DATABASE_URL`/`OTP_HASH_SECRET` in Secrets Manager; full set + CMK required. `secret-inventory.md`. |
| 10 | WAF / private admin edge / network isolation | BLOCKER (prod) | ❌ | Admin API is a separate process; no edge protection in repo. |
| 10a | Tuned WAF ruleset associated to the actual serving edge | HIGH (DOCUMENTED GAP) | 🟡 | CloudFront `E36DO8GL4SA61N` has an auto-created WebACL; rules/mode unverified. Plan + dry-run: `waf-readiness-plan.md`, `plan-waf-readiness.ps1`. **DNS divergence:** live `www` resolves to Vercel while CloudFront holds the same alias — apply WAF/Vercel-Firewall at the real serving edge. |
| 10b | Admin IP allowlist / VPN at the edge | HIGH (DOCUMENTED GAP) | 🟡 | App-level per-admin IP allowlist + Bearer + RBAC + TOTP exist (`admin-authenticate.ts`); edge/network allowlist documented, not enforced. |
| 10c | CSP / security headers staged rollout on frontends | MEDIUM (DOCUMENTED GAP) | 🟡 | API helmet headers present; `www` (Vercel) HSTS only; CloudFront/S3 none. CSP report-only first. `cloudfront-security-headers-readiness.md`. |
| 23 | Managed auth provider (Clerk/Auth0/Supabase) evaluation | LOW (future option) | ⏭️ | EXORA uses custom auth with strong controls (`docs/security/auth-hardening-checklist.md`). Managed provider is a **future architectural option**, not a blocker; migrating before the audit freeze is high risk and out of scope. |
| 24 | CAPTCHA / bot mitigation + progressive login delay | LOW (future option) | ⏭️ | Optional future hardening; rate limits + lockouts cover the risk today. No paid CAPTCHA vendor added. |
| 25 | Referral / Refer-and-Earn program | LOW (disabled) | ⏭️ | Hidden in INR-only audit mode (Stage 9A) until compliance/product approval. No rewards/earnings computed or shown. Re-enable via `NEXT_PUBLIC_REFERRALS_ENABLED`. |
| 26 | API Management (user API keys) | LOW (disabled) | ⏭️ | Hidden in INR-only audit mode (Stage 9A). No backend module / keys exist. Re-enable via `NEXT_PUBLIC_API_MANAGEMENT_ENABLED` once built + reviewed. |
| 27 | Support in-app notifications on admin reply/resolve | LOW (follow-up) | 🟡 | Ticket status transition (→ WAITING_FOR_USER / RESOLVED) is the user-visible signal today; dedicated `NotificationType` values deferred to avoid a fragile enum migration. |
| 10d | WAF false-positive tuning before strict blocking | MEDIUM (DOCUMENTED GAP) | ❌ | Managed/rate rules start in COUNT; tune before flipping to Block. |
| 10e | `CORS_ORIGINS` missing live frontend origins | HIGH (deploy-time) | 🟡 | Live value omits `https://www.exorain.com` / `https://exorain.com` and carries a placeholder. CORS code is correct (strict allowlist); fix the env value at deploy. **No code change.** |

## 5. Staging accepted risks

> Accepted for the staging/demo INR_ONLY environment **only**. Each is a
> production blocker above and must be closed before production.

| # | Item | Class | Notes |
|---|---|---|---|
| 12a | RDS automated backup retention = 1 day (staging default) | STAGING ACCEPTED RISK | Prod: 7–35 days PITR. |
| 4/5/6 | Mock KYC / liveness / sanctions / PEP providers | STAGING ACCEPTED RISK | Real vendors required before FIU onboarding; never presented as real. |
| 7 | Compliance risk gates default permissive | STAGING ACCEPTED RISK | Enable `COMPLIANCE_REQUIRE_*` in production. |
| 13/14 | No SIEM; retention not IaC-enforced | STAGING ACCEPTED RISK | Best-effort CloudWatch alarms only on staging. |
| 3 | No idle session timeout | STAGING ACCEPTED RISK | Absolute expiry present; idle timeout before production. |
| 18 | Security scans report-only in CI | STAGING ACCEPTED RISK | Flip to blocking after baseline. |

## 6. Already mitigated / implemented (evidenced controls)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | User 2FA/MFA (TOTP, hashed backup codes, login enforcement, AES-256-GCM secret) | ✅ | `docs/security/user-2fa-step-up-auth.md` |
| 2 | Step-up auth before withdrawal / address change (5-min single-use token) | ✅ | `docs/security/user-2fa-step-up-auth.md` |
| — | Admin TOTP encryption + admin login lockout | ✅ | `docs/security/admin-access-runbook.md` |
| — | Admin RBAC + lifecycle (soft-deactivate only) + activity timeline | ✅ | Stage 7A; `admin-access-runbook.md` |
| — | Single active user session (prev revoked `SESSION_REVOKED_BY_NEW_LOGIN`) | ✅ | `docs/security/user-session-security.md` |
| — | Login location requirement (`REQUIRE_LOGIN_LOCATION` / `LOCATION_REQUIRED`) | ✅ | `docs/security/user-session-security.md` |
| — | Fake profile/trading/security data removed; real-alerts-only | ✅ | Stage 7B; Stage 8 source scan |
| — | KYC upload MIME+size validation; KYC PII encrypted at rest | ✅ | `docs/compliance/kyc-aml-technical-workflow.md` |
| — | CloudWatch alarms present (5xx/DB/auth-fail/health/latency/404) | ✅ | `docs/security/cloudwatch-alarms-plan.md` |
| 22 | Crypto-global production boot guard | ✅ | `backend/src/lib/prod-safety.ts` |
| 8a | FIU technical-readiness evidence pack | ✅ | `docs/compliance/fiu-evidence-pack/README.md` |
| — | Auth input hardening: malformed JSON → 400, login password cap, HTML rejection in KYC/identity fields, generic login copy | ✅ | Stage 8A; `docs/security/auth-hardening-checklist.md` |
| — | Signup legal consent captured + versioned (Terms/Privacy/Risk) with ip/ua evidence; financial-action gate + consent banner | ✅ | Stage 9A; `backend/src/modules/legal/legal.consent.ts` (reuses `UserLegalAcceptance`) |
| — | User↔admin support ticket system (own-ticket scoping, RBAC, sanitized, rate-limited, audited; internal notes hidden) | ✅ | Stage 9A; `backend/src/modules/support/support.user.service.ts` |
| — | Wallet INR balance display fix (ledger-sourced; networkless fiat included) | ✅ | Stage 9A; `backend/src/modules/wallet/wallet.service.ts` |
| — | Referral + API Management hidden in INR-only audit mode | ✅ | Stage 9A; `frontend/lib/config.ts` (frontend flags; no backend module) |

---

## Do-not-enable reminders

- Do **not** enable crypto deposit/withdrawal/funding (INR_ONLY).
- Do **not** set `CRYPTO_*_GLOBAL_ENABLED=true` or `CRYPTO_PRODUCTION_READINESS_ACK=true` without the full crypto sign-off (§2).
- Do **not** add live withdrawal signing.
- Do **not** put any crypto private key / mnemonic in an app env var or secret the app reads.
- Do **not** integrate paid KYC/liveness/sanctions providers in this work.
- Do **not** automate real FIU filing.

Closing a blocker should update its status here and link the implementing change +
test/evidence. **This document does not certify production, FIU legal, or
production-crypto readiness.**
