# VAPT Evidence Pack

**Status: EVIDENCE INDEX — staging/demo (INR_ONLY).**
This is the index an auditor uses to locate evidence for EXORA's controls. It
points to code, tests, CI artifacts, and other documents. It does **not** assert
that an independent VAPT has been completed — that is a production blocker.

Related existing docs: `docs/security/AUDIT_SCOPE.md`,
`docs/security/VAPT_HANDOVER_CHECKLIST.md`,
`docs/security/SECURITY_HARDENING_REPORT.md`,
`docs/security/AUDITOR_TEST_ACCOUNTS_TEMPLATE.md`.

---

## 1. Build / test evidence

| Item | How to produce | Location |
|---|---|---|
| Backend typecheck | `npm run typecheck` (backend) | CI job `Backend CI` (`.github/workflows/ci.yml`) |
| Backend tests | `npm test` (backend) — now **blocking** in CI | CI job `Backend CI` |
| Prisma schema validity | `npx prisma validate` | CI step "Validate Prisma schema" |
| Frontend build | `npm run build` (frontend) | CI job `Frontend CI` |
| Mobile typecheck/lint | `npx tsc --noEmit`, `npx expo lint` | CI job `Mobile CI` |

## 2. Dependency scan (SCA) evidence

- Workflow: `.github/workflows/security-scans.yml` → job **dependency-audit**
  (`npm audit --audit-level=high`, matrix over backend/frontend/mobile).
- Artifacts: `npm-audit-<package>.json` (uploaded per run).
- **Report-only baseline:** the step does not fail the build yet; triage findings
  and flip to enforcing once clean. `npm audit fix --force` is intentionally
  NOT used (it can apply breaking upgrades).
- **Known blockers:** _record current high/critical advisories here after the
  first run, with the decision (fix / accept-with-justification / defer)._

## 3. SAST evidence

- Workflow: `.github/workflows/security-scans.yml` → job **sast** (Semgrep OSS,
  rule packs `p/security-audit`, `p/javascript`, `p/typescript`, metrics off).
- Artifact: `semgrep.sarif`.
- Report-only baseline; flip to enforcing after triage.

## 4. Secret scan evidence

- Workflow: `.github/workflows/security-scans.yml` → job **secret-scan**
  (gitleaks, `--redact`, full history, SARIF report).
- Artifact: `gitleaks.sarif`. Secrets are masked in logs (`--redact`).
- `.env` files are **git-ignored** (`.gitignore`) and not committed — verify:
  `git ls-files | grep -iE '\.env($|\.)'` → only `*.example` files.
- Production secret guard: dev/default secrets (incl. `OTP_HASH_SECRET`,
  `JWT_*`, `KYC_*`) are rejected at boot in real production
  (`backend/src/config/env.ts`, `validateEnv`); tests in
  `backend/test/unit/env-validation.test.ts`.

## 5. Auth / RBAC evidence

| Control | Evidence |
|---|---|
| Password hashing (Argon2id) | `backend/src/modules/auth/auth.service.ts` |
| Refresh rotation + reuse detection | `auth.service.ts` (`refresh`, `handleReuse`) |
| User + admin brute-force lockout | `auth.service.ts`, `admin-rbac.service.ts` |
| Admin TOTP (encrypted at rest) | `admin-rbac.service.ts` (`sealTotpSecret`) |
| Admin RBAC (all-of / any-of) | `backend/src/middleware/admin-authorize.ts` |
| Admin IP allowlist (every request) | `backend/src/middleware/admin-authenticate.ts` |
| Last-super-admin / self-action guard | `admin-rbac.service.ts` |
| Object-level access (User A ≠ B) | `auth.service.ts` (`validateAccessSession`), per-module ownership checks |
| Tests | `backend/test/unit/admin-rbac-service.test.ts`, `backend/test/integration/admin-rbac.test.ts`, auth tests |

## 6. KYC upload validation evidence

| Control | Evidence |
|---|---|
| MIME allowlist (jpeg/png/pdf only; blocks exe/script/archive/HTML/SVG) | `backend/src/modules/kyc/kyc.validators.ts` (`ALLOWED_KYC_MIME_TYPES`, `kycDocumentSchema`) |
| Server-side defense-in-depth (re-asserts type + size) | `backend/src/modules/kyc/kyc.service.ts` (`submitDocument`) |
| Max upload size (`KYC_MAX_UPLOAD_BYTES`, default 10 MiB) | `backend/src/config/env.ts`, `backend/src/config/index.ts` |
| PII encryption at rest (AES-256-GCM) | `backend/src/lib/encryption.ts`, `kyc.service.ts` |
| Tests | `backend/test/unit/kyc-validators.test.ts`, `backend/test/unit/kyc-service.test.ts` |

## 7. INR deposit / withdrawal evidence

| Control | Evidence |
|---|---|
| Manual INR deposit + maker-checker dual approval | `backend/src/modules/deposit/deposit.service.ts` |
| Same-admin approval prevention | `deposit.service.ts` (`SAME_APPROVER`) |
| Amount-tampering protection (integer paise) | `deposit.service.ts` (`settleCapturedPayment`) |
| Webhook signature verify + idempotency | `deposit.service.ts` (`handleWebhook`) |
| INR withdrawal lifecycle + ledger reserve/release | `backend/src/modules/inr-withdrawal/` |
| Admin approval audit trail | `admin_logs` writes in the above services |

## 8. Crypto-disabled evidence

| Control | Evidence |
|---|---|
| Global INR_ONLY mode; crypto positive flags default OFF | `backend/src/modules/feature-controls/feature-controls.types.ts` |
| Withdrawal route gated by feature flag | `backend/src/modules/withdrawal/withdrawal.routes.ts` (`requireUserFeature('canWithdrawCrypto', ...)`) |
| Live signing disabled (throws) | `backend/src/modules/withdrawal/providers/index.ts` |
| Mock signer holds no keys | `backend/src/modules/withdrawal/providers/withdrawal-signer.mock.ts` |
| See also | `docs/compliance/inr-only-mode.md` |

## 9. Audit logs evidence

| Control | Evidence |
|---|---|
| Append-only `audit_logs` / `admin_logs` (DB trigger) | `backend/prisma/migrations/.../migration.sql` (`reject_mutation`) |
| Central audit writer + action codes | `backend/src/lib/audit.ts` |
| Log redaction (passwords/OTP/keys/PII) | `backend/src/lib/logger.ts` (`redactPaths`) |
| Note | `prev_hash`/`row_hash` columns are RESERVED for a future hash chain and are **not yet written** (accurate per schema comment) |

## 10. Known production blockers

The single source of truth is `docs/compliance/production-blockers.md`. Summary:
user 2FA/MFA; step-up auth before withdrawal/address change; real KYC/liveness
provider; real sanctions/PEP/adverse-media provider; KMS/Secrets Manager;
WAF/private admin edge; centralized SIEM alerts; independent VAPT; independent
wallet/signer audit before live withdrawals; blockchain-to-ledger reconciliation
before live crypto.

---

**This pack indexes evidence for a staging/demo system. An independent VAPT by a
CERT-In empanelled auditor, and closure of the production blockers, are required
before production sign-off.**
