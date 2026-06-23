# EXORA — Security Hardening Report

**Stage:** 7.0B/7.0C — Security Hardening + Audit/VAPT Handover Pack
**Date:** 2026-06-23
**Environment:** AWS staging (`ap-south-1`)
**Author:** Engineering (internal hardening pass)

---

## 1. Scope

An internal, audit-focused security hardening pass over EXORA in preparation
for an external cybersecurity audit / VAPT. No business/product features were
added. Core money-movement, trading, matching, scanner, ledger settlement,
withdrawal signing, deposit crediting, and FIU/tax/legal business logic were
**not changed**. See `AUDIT_SCOPE.md` for the authoritative in/out-of-scope list.

## 2. Systems reviewed

- Backend **user API** (`src/app.ts`, port 4000, `/api/v1`).
- Backend **admin API** (`src/admin-app.ts`, port 4001, `/admin/v1`) — separate process, IP-allowlisted.
- Authentication & session (`src/lib/jwt.ts`, `src/middleware/authenticate.ts`, `admin-authenticate.ts`, auth module).
- RBAC (`src/middleware/authorize.ts`, `admin-authorize.ts`, `src/modules/admin-rbac/admin-rbac.baseline.ts`).
- Stage 5.7 AML policy engine + compliance workspace (maker-checker).
- KYC / compliance / FIU draft / tax / legal modules (PII handling, masking, redaction).
- Request hardening (`validate.ts`, `rate-limit.ts`, `error-handler.ts`, `not-found.ts`, body limits).
- Security headers & CORS (`src/middleware/security.ts`).
- Logging redaction (`src/lib/logger.ts`, `src/lib/redaction.ts`, `src/modules/compliance/evidence.util.ts`).
- Repository secret hygiene (tracked files, `.gitignore`, env examples, ECS task definitions).
- Dependency posture (backend / frontend / mobile `npm audit`).
- Cloud/deployment assumptions (see `CLOUD_SECURITY_CHECKLIST.md`).

## 3. Checks performed

| # | Check | Result |
|---|-------|--------|
| 1 | Repo-wide secret scan (AWS keys, JWT secrets, DB/Redis URLs, private keys, mnemonics, webhook secrets, admin passwords, provider keys, TOTP secrets, bearer tokens) | No live secret **values** found in tracked source. Findings were infra **identifiers** in deploy artifacts — see §4. |
| 2 | `.env` ignored; env examples are placeholders only | ✅ `.env` / `.env.*` ignored in all packages; examples use `change_me`/`dev-only` placeholders. |
| 3 | Frontend/mobile public config has no private secrets | ✅ Only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` (URLs) are bundled. |
| 4 | Access/refresh token expiry + rotation + revocation | ✅ Access 15m / refresh 30d; refresh rotation w/ reuse detection; Redis + DB session revocation; logout revokes session. |
| 5 | Admin token ≠ user token | ✅ Separated by JWT **audience** (`cex-api:access` vs `cex-admin:access`); cross-use rejected at the verifier (test added). |
| 6 | JWT rejects unsigned/invalid/expired/wrong-purpose/wrong-audience | ✅ Verified + tests (`jwt.test.ts`, new `stage-7-0b-audit.test.ts`). |
| 7 | Every `/admin/v1` route has `adminAuthenticate` + `adminAuthorize` | ✅ Verified across all admin routers, incl. Stage 5.7 AML/workspace. |
| 8 | Maker-checker separation | ✅ Maker can never decide own request (service-enforced); KYC_REVIEWER = maker only (no `approval.decide`); SUPER_ADMIN decides. |
| 9 | FINANCE cannot manage AML policy/rules | ✅ FINANCE has no `compliance.amlPolicy.*` / `compliance.approval.*` grants. |
| 10 | Request validation + body size limits | ✅ Zod `validate` middleware on inputs; `express.json({ limit: BODY_LIMIT })` (100kb default). |
| 11 | Rate limiting (login, register, password reset/OTP, admin login, money movement) | ✅ Redis-backed `authRateLimiter` on auth routes + admin login; `sensitiveRateLimiter` on withdrawal/manual deposit; `globalRateLimiter` everywhere. |
| 12 | Prod error responses do not leak stack traces | ✅ Central handler returns opaque 500 in prod (test added). |
| 13 | Invalid JSON / unknown routes return safe envelope | ✅ 404 → standard error envelope; JSON parse errors handled centrally. |
| 14 | Security headers | ✅ helmet (HSTS, nosniff, X-Frame-Options, Referrer-Policy, COOP/CORP) + **new** `Permissions-Policy` (Stage 7.0B). `x-powered-by` disabled. |
| 15 | CORS restricted to allowed origins | ✅ Strict allowlist from `CORS_ORIGINS`; disallowed browser origins rejected. |
| 16 | PAN/Aadhaar/KYC masking | ✅ `maskPan` / `maskAadhaar`; only masked DTOs returned; raw values encrypted at rest. |
| 17 | Logs exclude PII/secrets | ✅ pino `redact` paths; `redactSensitive` for ad-hoc objects (**widened** in Stage 7.0B). |
| 18 | Evidence packs / exports strip secrets | ✅ `stripSecrets` denylist + binary redaction (defense-in-depth). |
| 19 | Audit logging completeness | ✅ Audit events recorded across admin login, KYC decisions, screening override, STR/case changes, wallet-risk, Travel Rule, FIU draft lifecycle, legal publish/acceptance, tax statement, AML policy/rule, workspace task lifecycle, maker-checker create/approve/reject. |
| 20 | Dependency audit | See §6. |

## 4. Issues fixed

1. **Infra identifiers committed in deploy artifacts (medium).**
   ~35 tracked JSON files (`*taskdef*.json`, `cex-staging-*.json`, `*-overrides.json`)
   plus an empty `backend/aws` file and an accidental shell-redirect junk file
   (`backend/{console.error(e)`) exposed the **AWS account id (279115897513)**,
   **IAM role ARNs**, **Secrets Manager ARNs**, ECR image URIs, the CloudFront
   domain, a testnet cold-wallet address, and an IAM username.
   *No secret **values** were exposed* — secrets are correctly referenced by ARN
   via Secrets Manager.
   **Fix:** removed all of these from Git tracking (`git rm --cached`, kept on
   disk for local deploys), added ignore patterns to `backend/.gitignore` and a
   new root `.gitignore`, and added a **sanitized** `backend/deploy/taskdef.example.json`
   (placeholders only).

2. **Camel-case secret keys could bypass `redactSensitive` (low).**
   The defense-in-depth redactor's key pattern matched `database_url`/`redis_url`
   (snake_case) but **not** `databaseUrl`/`redisUrl` (camelCase) and lacked
   `mnemonic`/`passphrase`/`credential`/`connection_string`.
   **Fix:** widened `SECRET_KEY_PATTERN` in `src/lib/redaction.ts` to match both
   cases and the extra categories (test added).

3. **Missing `Permissions-Policy` header (low).**
   helmet 8 sets HSTS/nosniff/X-Frame-Options/Referrer-Policy but not
   `Permissions-Policy`.
   **Fix:** added `additionalSecurityHeaders` (denies camera/mic/geolocation/
   payment/usb/sensors) to both the user and admin apps (test added).

4. **Vulnerable runtime dependencies (high) — see §6.**
   **Fix:** `npm audit fix` (non-breaking) on backend cleared the `ws`/
   `engine.io`/`socket.io-adapter` memory-exhaustion DoS highs; frontend Next.js
   patched 14.2.5 → 14.2.35 (within major) clearing the critical + several highs;
   frontend `ws`/`engine.io-client` highs cleared by non-breaking `audit fix`.

## 5. Tests added

- `backend/test/unit/stage-7-0b-audit.test.ts` (11 tests):
  - user↔admin JWT non-interchangeability (audience), expired-token rejection, alg=none rejection;
  - hardened headers emitted (`X-Content-Type-Options: nosniff`, `Permissions-Policy`, `X-Frame-Options`, `Referrer-Policy`, no `x-powered-by`);
  - central error handler returns a generic message with **no stack trace / DSN** when `isProd`;
  - `redactSensitive` scrubs every secret category (tokens, passwords, keys, connection strings) with no leakage in serialized output.

Existing suites already cover (verified, not duplicated): RBAC per-route protection
(`aml-workspace-routes.test.ts`), role/permission matrix incl. maker-checker
separation (`admin-rbac-baseline.test.ts`), maker-cannot-approve-own at the
service layer (`workspace-service.test.ts`), PAN/Aadhaar masking
(`compliance-types.test.ts`), rate limiters on auth/admin/money routes and
health/version secret-free (`security-hardening.test.ts`), and the
review-only/no-money-mutation safety suites (`*-safety.test.ts`).

**Result:** backend unit suite **629 passing / 76 files** (incl. the new file).
Backend `typecheck` clean. Frontend `build` clean on Next 14.2.35.

## 6. Dependency audit summary

| Package set | Before | After (this stage) | Notes |
|-------------|--------|--------------------|-------|
| **Backend (prod, `--omit=dev`)** | 5 (2 mod, 3 high) | **2 moderate** | Remaining: `gaxios`→`uuid` (moderate, transitive of Google auth client). Highs (`ws` DoS) fixed. |
| **Backend (incl. dev)** | 11 (5 mod, 5 high, 1 crit) | 7 (5 mod, 1 high, 1 crit) | Remaining high/critical are **dev-only**: `vite` (high), `vitest`/`@vitest/mocker` (critical) — test tooling, not shipped. |
| **Frontend (prod)** | 10 (1 mod, 8 high, 1 crit) | **1 mod + 1 high** | Critical (Next) cleared by 14.2.35. Remaining high = Next.js Image-Optimizer DoS — **not applicable** (static export, no Next server). |
| **Frontend (incl. dev)** | 10 | ~10 (mostly dev) | Remaining highs are dev lint tooling (`eslint-config-next`/`typescript-eslint`/`glob`/`minimatch`); fix requires `eslint-config-next@16` (breaking major) — deferred. |
| **Mobile** | 20 (20 mod) | 20 moderate | 0 high / 0 critical. Transitive Expo/RN moderates; mobile config untouched this stage. |

Repeatable commands are in `SECURITY_RUNBOOK.md`.

## 7. Unresolved risks

1. **Git history still contains the infra identifiers** (account id + ARNs).
   Untracking does not rewrite history. *No secret values are in history* (only
   ARNs), so secret rotation is **not strictly required**, but recommend a
   history scrub (`git filter-repo`) before the repo is shared externally, and
   confirming the exposed account id is acceptable to disclose to the auditor.
2. **Dev-only critical/high** (`vitest`/`vite`, frontend lint chain) remain;
   fixes need major upgrades. Not in the production runtime. Track for a
   maintenance bump.
3. **Frontend Next.js Image-Optimizer DoS high** flagged by `npm audit` but not
   exploitable in the static-export deployment (no Next server). Re-evaluate if
   the frontend ever moves to SSR/self-hosted.
4. **Backend `gaxios`→`uuid` moderate** remains (Google auth client transitive);
   low impact, fix requires upstream bump.
5. Cloud-side items marked ☐ in `CLOUD_SECURITY_CHECKLIST.md` are **unconfirmed
   from the repo** and must be validated in the AWS account.

## 8. Staging-only mocks

All external providers (KYC, screening, liveness, wallet-risk, price, Razorpay,
withdrawal signer) run in **mock/testnet** mode in staging. FIU is draft/export
only; tax is calculation-only. See `AUDIT_SCOPE.md` §4.

## 9. Production blockers

- Real KYC / screening / liveness providers not integrated.
- Real payment (Razorpay live) not integrated.
- Real withdrawal signer / custody / HSM not integrated.
- All `ALLOW_MOCK_*` / `ALLOW_UNVERIFIED_EMAIL_LOGIN` / `ALLOW_ADMIN_LOGIN_WITHOUT_TOTP` flags must be false/removed; admin TOTP enforced.
- Migrate JWT HS256 → RS256 (asymmetric) per `ARCHITECTURE.md` §11 before production (interface unchanged).
- Confirm all ☐ cloud checklist items.

## 10. Disclaimer

This is an **internal hardening report**. It is **not** a legal certification,
not an FIU/PMLA compliance certification, and not a penetration-test report. It
is intended to prepare EXORA for an independent external VAPT.

## 11. Recommended next steps before external VAPT

1. Confirm the AWS cloud checklist (☐ items) with the account owner.
2. Decide on git-history scrub for the exposed account id/ARNs.
3. Provision auditor test accounts per `AUDITOR_TEST_ACCOUNTS_TEMPLATE.md`.
4. Stand up a dedicated, isolated staging slice for the engagement.
5. Enable WAF + access logs + CloudTrail/GuardDuty (recommended) before testing.
6. Share `VAPT_HANDOVER_CHECKLIST.md` (URLs, accounts, scope, contacts) with the auditor.
