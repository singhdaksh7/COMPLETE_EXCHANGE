# Edge Security Headers Readiness (Stage 6)

**Status: READINESS DOCUMENTATION — staging/demo (INR_ONLY).**
Recommended response headers for the public frontends and the monitor-first plan
to add them without breaking the site. No headers are changed by this work.

---

## 0. Current state (read-only capture, Stage 6)

Captured via `curl -I` (see `scripts/security/collect-edge-security-evidence.ps1`):

| Header | `www.exorain.com` (Vercel) | `dfk68tws8g8oj.cloudfront.net` (CloudFront→S3) |
|---|---|---|
| `Strict-Transport-Security` | ✅ `max-age=63072000` | ❌ missing |
| `X-Content-Type-Options` | ❌ missing | ❌ missing |
| `X-Frame-Options` / CSP `frame-ancestors` | ❌ missing | ❌ missing |
| `Referrer-Policy` | ❌ missing | ❌ missing |
| `Permissions-Policy` | ❌ missing | ❌ missing |
| `Content-Security-Policy` | ❌ missing | ❌ missing |
| `Cache-Control` | `public, max-age=0, must-revalidate` | (default; `X-Cache: Miss from cloudfront`) |

Notes:
- The live `www` frontend is **Vercel** (HSTS present, other headers missing).
  CloudFront `E36DO8GL4SA61N` fronts **two origins** — the staging ALB (API) and
  the S3 frontend — and returns no security headers on the S3 path. Apply header
  policy at the **actual serving edge**: Vercel config for `www`, and a CloudFront
  response-headers-policy for anything served via CloudFront. Resolve the
  DNS↔CloudFront divergence first (`admin-edge-security-readiness.md` §0).
- Root `exorain.com` → 301 → `www` (Hostinger) and already sends
  `Content-Security-Policy: upgrade-insecure-requests` on the redirect.
- The backend API sets its own headers via helmet
  (`backend/src/middleware/security.ts`) — HSTS, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, cross-origin set, `Permissions-Policy`.
  CSP is intentionally **off** on the JSON API (CSP belongs on the HTML frontends).

## 1. Recommended headers (frontend HTML responses)

| Header | Recommended value | Rationale |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS; add `includeSubDomains` only when every subdomain is HTTPS. |
| `X-Content-Type-Options` | `nosniff` | Stop MIME sniffing. |
| `X-Frame-Options` | `DENY` (or CSP `frame-ancestors 'none'`) | Clickjacking protection. Prefer CSP `frame-ancestors` long-term. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Deny unused browser features. |
| `Content-Security-Policy` | **staged** (see §2) | Strongest control; highest breakage risk — roll out carefully. |

## 2. Content-Security-Policy — staged, monitor-first

A strict CSP can break a Next.js/SPA frontend (inline scripts, framework
hydration, third-party scripts). Roll out in phases:

1. **Report-only first:** ship `Content-Security-Policy-Report-Only` with a
   candidate policy and a `report-uri`/`report-to` endpoint. Observe violations;
   change nothing for users.
2. **Tighten** based on real reports (allow only the origins the app needs:
   the API origin, fonts/CDN, analytics if any). Avoid `unsafe-inline` for
   scripts; use nonces/hashes where the framework supports them.
3. **Enforce** by switching to `Content-Security-Policy` once report-only is
   clean for a representative period.
4. Always include `frame-ancestors 'none'` and `upgrade-insecure-requests`.

> Do **not** ship a strict enforcing CSP blindly — it will likely break the
> frontend. Report-only is mandatory first.

## 3. Cache-Control expectations

| Path class | Recommended | Notes |
|---|---|---|
| Static hashed assets (`/_next/static/*`, fingerprinted JS/CSS) | `public, max-age=31536000, immutable` | Safe — content-hashed filenames. |
| HTML / app shell | `public, max-age=0, must-revalidate` (current) or short s-maxage | Must revalidate so deploys take effect. |
| API responses (`/api/v1/*`) | `no-store` (or `private, no-cache`) for authenticated/data responses | Never cache user/admin data at a shared edge. |
| Admin (`/admin/v1/*`) | `no-store` | Never cache admin responses. |

## 4. How to add headers (when ready — not in this stage)

- **CloudFront:** create a **response-headers-policy** (security headers config)
  and attach it to the distribution's default behavior — no app/origin change,
  fully reversible. Start CSP in report-only.
  ```bash
  aws cloudfront list-response-headers-policies --type custom --region us-east-1
  # create-response-headers-policy ... then update-distribution to attach it
  ```
- **Vercel (`www`):** set headers in `vercel.json` / `next.config` `headers()`.
- **Backend API:** helmet already covers it; only adjust if a gap is found
  (none required this stage).

## 5. Monitor-first principle

Add non-CSP headers first (low risk: HSTS, nosniff, frame-options,
referrer-policy, permissions-policy). Add CSP in **report-only**, observe, then
enforce. Verify after each change with the evidence script's header check and
roll back the policy attachment if anything breaks.

---

**No header is changed by this work** — this is the plan + current-state
evidence. Apply via CloudFront response-headers-policy / Vercel config when the
combined Stage 8 deploy happens.
