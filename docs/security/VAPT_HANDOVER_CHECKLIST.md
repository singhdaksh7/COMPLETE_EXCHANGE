# EXORA — VAPT Handover Checklist

**Stage:** 7.0B/7.0C
**Environment under test:** STAGING only
**Last updated:** 2026-06-23

Hand this document to the external VAPT vendor. Fill every `<placeholder>` with
real values **out of band** (secure channel) — do not commit real URLs,
credentials, or contacts to Git.

---

## 1. Targets

| Surface | URL | Notes |
|---------|-----|-------|
| User web app (frontend) | `<https://staging-frontend-url>` | CloudFront static export |
| User API base | `<https://staging-api-url>/api/v1` | Express, port 4000 behind ALB |
| Admin panel (frontend) | `<https://staging-admin-url>` | IP-allowlisted |
| Admin API base | `<https://staging-admin-api-url>/admin/v1` | Separate process, port 4001, IP-allowlisted |
| Health/liveness | `<api>/health`, `<api>/api/v1/health` | Unauthenticated, safe metadata only |

## 2. Mobile app status

- Build state: **NOT finalized / not frozen** for production release.
- In scope: **configuration & assumptions only** (public API base URL, no
  secrets in bundle, TLS, auth flows against the staging API).
- Out of scope: the final client-customized APK / iOS binary (not produced in this stage).
- If a test build is provided, distribute the artifact **out of band**.

## 3. Test account requirements

Provisioned per `AUDITOR_TEST_ACCOUNTS_TEMPLATE.md`. Provide **out of band**:
- 1× standard **user** account (KYC at a known tier).
- 1× **SUPER_ADMIN**, 1× **KYC_REVIEWER**, 1× **FINANCE**, 1× **READ_ONLY** admin.
- Admin **IP allowlist**: the auditor's source IP(s) must be added to each admin
  account (admin access is rejected from non-allowlisted IPs on every request).
- Admin **TOTP**: enrollment instructions if TOTP is enforced for the engagement.

## 4. Roles to test

`SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`, `READ_ONLY`, and standard
user. Specifically validate privilege boundaries (see §5).

## 5. High-risk flows to test

- **AuthN/AuthZ:** login, refresh rotation + reuse detection, logout/revocation,
  lockout, JWT tampering, user-token-on-admin-route, admin-token-on-user-route,
  expired/unsigned tokens.
- **RBAC / IDOR:** horizontal (user A → user B's data) and vertical (lower role →
  higher-privilege actions) escalation across all admin modules.
- **Maker-checker:** attempt to approve your own AML approval request; attempt
  `approval.decide` as KYC_REVIEWER; attempt AML policy management as FINANCE.
- **KYC / PII:** can raw PAN/Aadhaar/documents be retrieved anywhere? (Expected:
  masked only.) Test KYC upload endpoints, evidence packs, exports, FIU drafts.
- **Money movement (read for tampering, not value):** withdrawal request,
  deposit, conversion, trading — validation, rate limits, idempotency, dual
  approval thresholds. (Funds are testnet/mock.)
- **Injection / input:** SQLi (Prisma-parameterized), XSS (stored/reflected),
  SSRF, path traversal, mass assignment, oversized body, malformed JSON.
- **Rate limiting / brute force:** login, register, password reset/OTP, admin login.
- **Transport / headers / CORS:** TLS config, security headers, CORS origin allowlist.
- **Webhooks:** Razorpay/KYC webhook HMAC verification (mock mode in staging).
- **Session:** fixation, concurrent sessions, revocation propagation.

## 6. Out-of-scope items

- Real FIU submission, real tax filing, real banking/payment rails, real
  custody/HSM/withdrawal signing, production mainnet funds.
- Final client-customized mobile APK/iOS (not frozen).
- AWS managed-service internals beyond configuration (RDS/ElastiCache/CloudFront engines).
- Destructive/DoS testing against shared staging without prior written
  agreement and a maintenance window.
- Social engineering / physical security (unless separately contracted).

## 7. Known mocks (do not report as exploitable "live" integrations)

KYC, screening, liveness, wallet-risk, price, Razorpay, withdrawal signer are
**mock/testnet**. FIU = draft/export only. Tax = calculation-only. Full list in
`AUDIT_SCOPE.md` §4.

## 8. Emergency contact

| Role | Name | Channel |
|------|------|---------|
| Primary security contact | `<name>` | `<email/phone — out of band>` |
| Engineering on-call | `<name>` | `<channel>` |
| Escalation / owner | `<name>` | `<channel>` |

Agree a **stop-testing** signal and a window for any test that could degrade
shared staging.

## 9. Report delivery expectations

- Findings with severity (CVSS), reproduction steps, evidence, and remediation.
- Preliminary notice of any **critical** finding within `<X hours>` of discovery.
- Draft report by `<date>`, final after remediation re-test.
- Deliver the report via `<secure channel>`; do not email credentials/secrets.
- A re-test of fixed criticals/highs is expected before sign-off.
