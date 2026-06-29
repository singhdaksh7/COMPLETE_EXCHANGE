# Production Blockers

**Mode: INR_ONLY staging/demo.** The items below MUST be closed before EXORA
serves real users / real money, and before crypto is ever re-enabled. This is the
single source of truth referenced by the other compliance and security docs.

Status legend: ❌ not started · 🟡 partial/mock/abstraction exists · ✅ done.

---

## A. Authentication & access

| # | Blocker | Status | Required before | Notes |
|---|---|---|---|---|
| 1 | **User 2FA/MFA** | ✅ | Production | TOTP enrollment/confirm/disable, hashed one-time backup codes, login enforcement (`2FA_REQUIRED` challenge → `/auth/2fa/verify`), rate-limited verification, audit events. Secret AES-256-GCM encrypted at rest. See `docs/security/user-2fa-step-up-auth.md`. |
| 2 | **Step-up auth before withdrawal / address change** | ✅ | Live withdrawals | `requireStepUp` gate on INR withdrawal + crypto withdrawal/address routes; fresh TOTP/backup (or password if no 2FA) → 5-min single-use token. Does not alter ledger/payout lifecycle. See `docs/security/user-2fa-step-up-auth.md`. |
| 3 | Admin idle/session timeout | 🟡 | Production | Absolute expiry exists; idle timeout missing. |

## B. KYC / AML / compliance

| # | Blocker | Status | Required before | Notes |
|---|---|---|---|---|
| 4 | **Real KYC / liveness provider** | 🟡 | FIU onboarding | Mock providers only; real vendor + AV scan needed. |
| 5 | Malware/AV scan + real object storage for uploads | ❌ | FIU onboarding | Upload is a stub; MIME+size validation is implemented. |
| 6 | **Real sanctions / PEP / adverse-media provider** | 🟡 | FIU onboarding | Mock screening; enable require-sanctions gate in prod. |
| 7 | Enable compliance risk gates (default permissive in staging) | 🟡 | FIU onboarding | `COMPLIANCE_REQUIRE_*` flags. |
| 8 | FIU manual reporting procedure (no automation) | 🟡 | FIU onboarding | Draft-only assembly exists; filing stays manual. |

## C. Secrets & infrastructure

| # | Blocker | Status | Required before | Notes |
|---|---|---|---|---|
| 9 | **KMS CMK** for production secrets | ❌ | Production | KYC PII + all 2FA seeds use a key derived from `KYC_ENCRYPTION_KEY` today. Plan: `docs/security/kms-readiness.md` (`alias/exora/prod/secrets`). |
| 10 | **WAF / private admin edge / network isolation** | ❌ | Production | Admin API is a separate process; no edge protection in repo. |
| 10a | **AWS WAF on CloudFront is the default auto-created ACL, not a tuned ruleset** | 🟡 (audit-readiness gap) | Production | CloudFront `E36DO8GL4SA61N` already has a `CreatedByCloudFront-*` WebACL associated, but its rules/mode/false-positive posture are unverified. Plan + dry-run script ready (`docs/security/waf-readiness-plan.md`, `scripts/security/plan-waf-readiness.ps1`) to review/augment with managed groups + rate rules in COUNT mode. **DNS divergence:** live `www` resolves to Vercel while CloudFront holds the same alias — align DNS and apply WAF/Vercel-Firewall at the actual serving edge. |
| 10b | **Admin IP allowlist / VPN at the edge not enforced** (documented only) | 🟡 (audit-readiness gap) | Production | App-level per-admin IP allowlist + Bearer + RBAC + TOTP exist (`admin-authenticate.ts`); edge/network IP allowlist or VPN/bastion/Zero-Trust is documented, not enforced (`docs/security/admin-access-runbook.md`). |
| 10c | **CSP / security headers** need staged rollout on frontends | 🟡 (audit-readiness gap) | Production | API helmet headers present; `www` (Vercel) has HSTS only; CloudFront/S3 has none. CSP must be report-only first (`docs/security/cloudfront-security-headers-readiness.md`). |
| 10d | **WAF false-positive tuning** required before strict blocking | ❌ (audit-readiness gap) | Production | Managed/rate rules start in COUNT (monitor) mode; tune via sampled requests before flipping to Block. |
| 10e | **`CORS_ORIGINS` missing live frontend origins** | 🟡 (deploy-time gap) | Production | Live value omits `https://www.exorain.com` / `https://exorain.com` and carries a placeholder `app-staging.example.com`. CORS code is correct (strict allowlist); fix the env value at the Stage 8 deploy. No code change. |
| 11 | Infrastructure-as-Code (VPC/SG, private DB/S3, RDS/EBS/S3 encryption) | ❌ | Production | No IaC in repo; configure + codify. |
| 12 | Backup automation + tested restore + DR/BCP | 🟡 | Production | Drill checklist exists (`docs/security/backup-restore-drill.md`); not executed. |
| 12a | **RDS automated backup retention** raised from staging default | ❌ | Production | Staging is **1 day**; production must be **7–35 days** (point-in-time recovery). Verify with `describe-db-instances` `BackupRetentionPeriod`. |
| 12b | **Secrets rotation policy** | ❌ | Production | No rotation enabled today. Runbook: `docs/security/secrets-rotation-runbook.md`; evidence: `scripts/security/collect-secrets-evidence.ps1`. |
| 12c | **IAM least-privilege review** of ECS task/execution roles | ❌ | Production | No wildcard `secretsmanager:*` / `kms:Decrypt *` / admin policies on task roles; scope per service. Plan: `docs/security/iam-least-privilege-readiness.md`. |
| 12d | Production secrets injected via Secrets Manager (not plaintext env) under CMK | 🟡 | Production | `DATABASE_URL`/`OTP_HASH_SECRET` exist in Secrets Manager; full set + CMK required. Inventory: `docs/security/secret-inventory.md`. |
| 12e | Split `TOTP_ENCRYPTION_KEY` from `KYC_ENCRYPTION_KEY` | ❌ | Production (hardening) | One key currently seals KYC PII **and** all user/admin TOTP seeds — large blast radius. |

## D. Logging, monitoring & CERT-In

| # | Blocker | Status | Required before | Notes |
|---|---|---|---|---|
| 13 | **Centralized SIEM alerts** (failed-login, suspicious withdrawal, admin-risk) | ❌ | CERT-In / Production | Detection is manual log/audit review today. **CloudWatch alarms (`docs/security/cloudwatch-alarms-plan.md`) are best-effort, NOT a SIEM replacement.** Tamper-resistant log storage / SIEM remains a blocker. |
| 14 | 180-day ICT log retention enforced + time-sync (NTP) | 🟡 | CERT-In | Steps documented (`docs/security/log-retention-180-days.md`); not enforced in IaC. |
| 15 | Incident response operationalized (named contacts, drills) | 🟡 | CERT-In | Process defined (`docs/security/cert-in-incident-response.md`). |
| 16 | Audit hash-chain populated (`prev_hash`/`row_hash`) | ❌ | CERT-In (evidence integrity) | Columns reserved; append-only enforced today. |

## E. Independent assurance & crypto readiness

| # | Blocker | Status | Required before | Notes |
|---|---|---|---|---|
| 17 | **Independent VAPT** by a CERT-In empanelled auditor | ❌ | Production | Evidence pack: `docs/security/vapt-evidence-pack.md`. |
| 18 | Dependency / SAST / secret scanning enforced | 🟡 | VAPT | CI scans added **report-only** (`.github/workflows/security-scans.yml`); flip to blocking after baseline. |
| 19 | **Independent wallet / signer audit** | ❌ | Live withdrawals | Live signing disabled until complete. |
| 20 | **Blockchain-to-ledger reconciliation** | ❌ | Live crypto | Required before crypto is re-enabled. |
| 21 | **No crypto private keys in app env** (HSM/KMS/signer-service design first) | ❌ (policy enforced) | Live crypto | No private key/mnemonic in any env var, Secrets Manager string the app reads, `.env`, or repo. Requires a dedicated HSM/KMS-backed signer service. Policy: `docs/security/secret-inventory.md` §3, `kms-readiness.md` §10. |
| 22 | **Crypto-global production boot guard** | ✅ | (gate for live crypto) | Stage 5: real production refuses to boot with any `CRYPTO_*_GLOBAL_ENABLED=true` unless `CRYPTO_PRODUCTION_READINESS_ACK=true` (`backend/src/lib/prod-safety.ts`, tests in `backend/test/unit/prod-safety.test.ts`). The ack must only be set after #19/#20/#21 + custody + monitoring + compliance sign-off. |

> **No production crypto** until reconciliation (#20), custody + withdrawal
> signing (#19, #21), monitoring (#13), and compliance/licensing are all
> approved. The Stage 5 boot guard (#22) is a safety latch, not approval.

---

## Do-not-enable reminders

- Do **not** enable crypto deposit/withdrawal/funding (INR_ONLY).
- Do **not** set `CRYPTO_*_GLOBAL_ENABLED=true` or `CRYPTO_PRODUCTION_READINESS_ACK=true` without the full crypto sign-off above.
- Do **not** add live withdrawal signing.
- Do **not** put any crypto private key / mnemonic in an app env var or secret the app reads.
- Do **not** integrate paid KYC/liveness/sanctions providers in this work.
- Do **not** automate real FIU filing.

These blockers are the gate. Closing a blocker should update its status here and
link the implementing change + test/evidence.
