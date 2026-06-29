# Production Blockers

**Mode: INR_ONLY staging/demo.** The items below MUST be closed before EXORA
serves real users / real money, and before crypto is ever re-enabled. This is the
single source of truth referenced by the other compliance and security docs.

Status legend: ❌ not started · 🟡 partial/mock/abstraction exists · ✅ done.

---

## A. Authentication & access

| # | Blocker | Status | Required before | Notes |
|---|---|---|---|---|
| 1 | **User 2FA/MFA** | ❌ | Production | Schema field exists; no enrollment/verification/enforcement. |
| 2 | **Step-up auth before withdrawal / address change** | ❌ | Live withdrawals | No re-auth on money-movement or allowlist changes. |
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
| 9 | **KMS / Secrets Manager** for production secrets | ❌ | Production | PII key derived from config secret today. |
| 10 | **WAF / private admin edge / network isolation** | ❌ | Production | Admin API is a separate process; no edge protection in repo. |
| 11 | Infrastructure-as-Code (VPC/SG, private DB/S3, RDS/EBS/S3 encryption) | ❌ | Production | No IaC in repo; configure + codify. |
| 12 | Backup automation + tested restore + DR/BCP | 🟡 | Production | Drill checklist exists (`docs/security/backup-restore-drill.md`); not executed. |

## D. Logging, monitoring & CERT-In

| # | Blocker | Status | Required before | Notes |
|---|---|---|---|---|
| 13 | **Centralized SIEM alerts** (failed-login, suspicious withdrawal, admin-risk) | ❌ | CERT-In / Production | Detection is manual log/audit review today. |
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

---

## Do-not-enable reminders

- Do **not** enable crypto deposit/withdrawal/funding (INR_ONLY).
- Do **not** add live withdrawal signing.
- Do **not** integrate paid KYC/liveness/sanctions providers in this work.
- Do **not** automate real FIU filing.

These blockers are the gate. Closing a blocker should update its status here and
link the implementing change + test/evidence.
