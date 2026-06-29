# Admin Edge Security Readiness (Stage 6)

**Status: AUDIT-READINESS DOCUMENTATION — staging/demo (INR_ONLY).**
Prepared for cybersecurity audit + FIU technical-readiness review. **Not** a
production-launch task (deploy deferred to after Stage 8). No business logic
changed; crypto stays OFF.

Region `ap-south-1` · ECS cluster `cex-staging` · services `cex-staging-api`,
`cex-staging-admin` · CloudFront `E36DO8GL4SA61N` (`dfk68tws8g8oj.cloudfront.net`).

---

## 0. Observed edge topology (read-only, captured Stage 6)

Captured via `scripts/security/collect-edge-security-evidence.ps1`. There is an
important **DNS ↔ CloudFront divergence** that determines where edge controls
(WAF, headers) must actually be applied:

| Host | Live serving path (per DNS) | Notes |
|---|---|---|
| `exorain.com` (root) | 301 redirect → `https://www.exorain.com` (LiteSpeed / **Hostinger**) | Root redirect works. |
| `www.exorain.com` | **Vercel** (CNAME → `*.vercel-dns-017.com`) | HSTS present; other headers missing. This is where live `www` traffic goes today. |
| `dfk68tws8g8oj.cloudfront.net` | **CloudFront `E36DO8GL4SA61N`** | Status Deployed; ACM cert; **two origins** — the staging **ALB** (`cex-staging-alb-*.elb.amazonaws.com`, i.e. the API) **and** the **S3 frontend** bucket; 2 extra cache behaviors (path-based routing). No security headers on the S3 path. |
| `api.exorain.com`, `admin.exorain.com` | do **not** resolve | No dedicated public custom domain for API/admin. |

**The divergence:** CloudFront `E36DO8GL4SA61N` is itself configured with aliases
`exorain.com` **and** `www.exorain.com` (+ ACM cert), yet live DNS for `www`
points to **Vercel**. So CloudFront is provisioned for those names but is not the
current `www` serving edge. CloudFront also already has a WAF WebACL associated
(an auto-created `CreatedByCloudFront-*` ACL — see `waf-readiness-plan.md` §0).

> **Audit-readiness implications:**
> - Apply WAF/headers at the **actual serving edge**. For `www` today that is
>   **Vercel** (Vercel Firewall + Vercel header config). For traffic that does go
>   through CloudFront (the cloudfront.net domain and anything pointed at it),
>   AWS WAF applies.
> - **Confirm the intended edge** for `exorain.com`/`www`: CloudFront-or-Vercel
>   should be decided and DNS aligned, so controls aren't half-applied to an edge
>   that serves no live traffic.
> - Because CloudFront fronts the **ALB (API)** as well as S3, the AWS WAF on
>   CloudFront is relevant to API traffic that traverses it.

## 1. Admin surface inventory

- **Separate process:** the admin API is a distinct Express app
  (`backend/src/admin-app.ts`) on its own port (`ADMIN_PORT`, default 4001) and
  prefix (`ADMIN_API_PREFIX`, default `/admin/v1`) — deployed as the
  `cex-staging-admin` ECS service, separate hostname from the user API.
- **Admin base path:** `/admin/v1` (+ liveness `/admin/v1/ping`, health).
- **Admin routers** (all under `/admin/v1`, see `backend/src/routes/admin.ts`):
  `/kyc`, `/inr/deposits`, `/inr/withdrawals`, `/crypto`, `/wallets`, `/scanner`,
  `/withdrawals`, `/conversions`, `/spot`, `/operations`, `/ops`, `/reports`,
  `/notifications`, `/admin-notifications`, `/support`, `/system`, `/security`,
  `/compliance` (+ dashboard/cases/wallet-risk/evidence/fiu/aml), `/tax`,
  `/legal`, `/users` (+ feature-controls, profile), plus admin RBAC/auth at `/`.

## 2. Public user API surface

- User API (`backend/src/app.ts`): port `PORT` (default 4000), prefix
  `API_PREFIX` (default `/api/v1`), `cex-staging-api` ECS service.
- Health/version at `/` and under the API prefix (for LB / path routing).
- Auth, KYC, wallet, INR deposit/withdrawal, trading, conversion, tax/legal —
  all gated by user auth + per-route rate limits + feature flags.

## 3. Already-implemented controls (verified in code)

| Control | Where |
|---|---|
| **Admin Bearer auth** (admin access JWT + server-side session validation) | `middleware/admin-authenticate.ts` (`verifyAdminAccessToken`, `validateAdminSession`) |
| **Per-admin IP allowlist**, enforced on EVERY request (not just login) | `admin-authenticate.ts` (`isIpAllowed`) |
| **Admin RBAC** (permission-gated, all-of/any-of) | `middleware/admin-authorize.ts`, applied per route in `admin-rbac.routes.ts` |
| **Admin TOTP/2FA** (encrypted at rest; required in prod unless explicit staging override) | `admin-rbac.service.ts` (`sealTotpSecret`), `prod-safety.ts` (`adminTotpRequired`) |
| **Admin login lockout** (Redis brute-force lockout) | `admin-rbac.service.ts` |
| **Admin login rate limit** | `authRateLimiter` on the admin login route (`admin-rbac.routes.ts`) |
| **Sensitive-admin-mutation throttle** | `adminSensitiveRateLimiter` (`middleware/rate-limit.ts`) |
| **Global rate limit** (Redis-backed, shared across replicas) | `globalRateLimiter` mounted in `admin-app.ts` + `app.ts` |
| **Append-only admin audit log** (`admin_logs`, DB trigger rejects UPDATE/DELETE) | `lib/audit.ts`, migration trigger |
| **Security headers** (helmet: HSTS, nosniff, frameguard, referrer, cross-origin) + `Permissions-Policy` | `middleware/security.ts` |
| **Strict CORS allowlist** (from `CORS_ORIGINS`); no-Origin allowed for mobile/server | `middleware/security.ts` (`corsMiddleware`) |
| **Maker-checker** on sensitive approvals; last-super-admin guard | `admin-rbac.service.ts`, deposit/withdrawal services |

## 4. Known current exposure (staging)

- The admin API process is **network-reachable** wherever its ECS service/edge
  is published; it is protected by **auth + per-admin IP allowlist + RBAC +
  TOTP + rate-limit**, not by a network perimeter (no WAF / no private edge /
  no VPN-only ingress in the repo). An unauthenticated request should receive
  `401/403`, never data — verified procedure in `admin-endpoint-safe-checks.md`.
- No AWS WAF is asserted in the repo; association is checked by the evidence
  script. CloudFront/S3 static origin currently returns **no security headers**.
- `credentials: true` on CORS is **low risk today** (Bearer tokens, not cookies)
  — documented in `security.ts`; revisit before production.

## 5. Stage 6 evidence checks (this stage)

Run the read-only collectors and attach output to the evidence pack:

```powershell
./scripts/security/collect-edge-security-evidence.ps1
./scripts/security/plan-waf-readiness.ps1            # dry-run WAF plan (no AWS changes)
```

Manual auditor checks: `admin-endpoint-safe-checks.md`. Header/WAF/header-policy
posture: `cloudfront-security-headers-readiness.md`, `waf-readiness-plan.md`.

## 6b. Backend CORS / security config review (Stage 6, read-only)

Reviewed `backend/src/middleware/security.ts` and the live `cex-staging-api`
task def (read-only):

- **CORS uses a strict allowlist** (`corsOrigins` from `CORS_ORIGINS`), not a
  wildcard; an `origin` callback rejects disallowed browser origins; no-Origin
  callers (mobile/server) are allowed. `credentials: true` is **low risk** (Bearer
  tokens, not cookies) and documented in code. **No code change needed.**
- **helmet + `Permissions-Policy`** are applied to both the user and admin apps
  (`app.ts`, `admin-app.ts`). CSP is intentionally off on the JSON API.
- **Admin auth is consistently applied:** all 26 admin router files reference
  `adminAuthenticate` (Bearer + session + per-admin IP allowlist), with
  `adminAuthorize('<perm>')` for RBAC.
- **GAP (deploy-time env, not code):** the live `CORS_ORIGINS` is
  `http://localhost:3000, https://dfk68tws8g8oj.cloudfront.net,
  https://app-staging.example.com`. It is **missing `https://www.exorain.com`
  and `https://exorain.com`** (the live frontend origins) and still carries a
  placeholder `app-staging.example.com`. If a browser at `www.exorain.com` ever
  calls the API cross-origin, it will be CORS-blocked. Fix the `CORS_ORIGINS`
  value at the combined Stage 8 deploy (no code change). Tracked as blocker 10e.

## 6. Future optional hardening (not in this stage)

- AWS WAF WebACL on whatever CloudFront actually fronts (managed rules +
  rate-based rules), monitor-mode first — `waf-readiness-plan.md`.
- Private admin edge: admin panel behind VPN / bastion / Zero-Trust, or an
  edge IP allowlist in front of the network (in addition to the app-level
  per-admin allowlist).
- CloudFront / Vercel response-headers policy for the static frontend(s).
- Admin idle-session timeout (absolute expiry exists; idle timeout is a blocker).
- Centralized SIEM + tamper-resistant log storage (existing blocker).

---

**Scope reminder:** Stage 6 is docs + read-only/ dry-run scripts. No WAF
created, no AWS resource modified, no backend behavior changed, crypto stays OFF.
