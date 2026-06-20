# Production Security Checklist (Stage 4.2)

Exora hardening reference for a safe production-style deployment. Staging runs
`NODE_ENV=production` with offline/mock services, so the app enforces explicit,
clearly-named `ALLOW_*` overrides for every unsafe-in-production toggle. Without
the override, the process **fails fast at boot** (or refuses the action). This
keeps a real production deployment from silently inheriting staging behaviour.

See: `src/lib/prod-safety.ts`, `src/config/env.ts`, `.env.production.example`,
`.env.staging.example`.

---

## 1. Required production secrets / config

| Setting | Production value | Guard |
|---|---|---|
| `NODE_ENV` | `production` | enables all guards below |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥32-char random, distinct, from a secrets store | rejected if a `change_me_*` placeholder |
| `KYC_ENCRYPTION_KEY` | strong KMS-wrapped key | rejected if the dev default |
| `KYC_WEBHOOK_SECRET` | strong secret | rejected if the dev default |
| `CORS_ORIGINS` | exact app + admin origins, **no wildcard/localhost** | required (non-empty) in production |
| `MAIL_PROVIDER` | `ses` (+ `AWS_REGION`, SES-verified `MAIL_FROM`) | `log` rejected unless `ALLOW_LOG_MAIL_PROVIDER` |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | `false` rejected unless `ALLOW_UNVERIFIED_EMAIL_LOGIN` |
| Admin TOTP | every admin enrolled (real TOTP) | TOTP-less login rejected unless `ALLOW_ADMIN_LOGIN_WITHOUT_TOTP` |
| `WITHDRAWAL_SIGNER` | real KMS/HSM signer (not yet implemented) | `mock` rejected unless `ALLOW_MOCK_WITHDRAWAL_SIGNER` |
| `*_PROVIDER` (TRON/BSC/PRICE/RAZORPAY/KYC) | `live` with real credentials | `mock` rejected unless `ALLOW_MOCK_PROVIDERS` |
| `RAZORPAY_*` (live) | real key id/secret/webhook secret | rejected if missing/dev when `RAZORPAY_PROVIDER=live` |
| `TRONGRID_API_KEY` / `BSC_TESTNET_RPC_URL` | real values | required when that provider is `live` |
| `DATABASE_URL` / `REDIS_URL` | TLS (`sslmode=require` / `rediss://`) | required |
| `WITHDRAWAL_ADDRESS_COOLDOWN_MS` | `86400000` (24h) recommended | — |

Secrets come from AWS Secrets Manager / SSM, never committed.

## 2. Admin authentication

- **TOTP required in production.** `admin.login` blocks an admin whose TOTP is
  not enabled (`ADMIN_TOTP_REQUIRED`) and audits `admin.login_blocked_no_totp`,
  unless `ALLOW_ADMIN_LOGIN_WITHOUT_TOTP=true` (staging/bootstrap only).
- TOTP reset (`admin.totp_reset`), TOTP enroll/enable, and IP-allowlist changes
  are audit-logged (`admin_logs` + hash-chained `audit_logs`).
- Per-admin **IP allowlist** is enforced at login; a blocked IP audits
  `admin.login_blocked_ip` and never issues a session.
- Admin sessions are revocable; password change/reset revokes other sessions.
- Admin login is rate-limited (`authRateLimiter`).

## 3. Rate limits / abuse controls

| Endpoint | Limiter |
|---|---|
| user login, register, verify/resend, refresh, forgot/reset/change password, OAuth | `authRateLimiter` |
| admin login | `authRateLimiter` |
| KYC submit + document upload | `authRateLimiter` |
| withdrawal request (`POST /withdrawals`) | `sensitiveRateLimiter` |
| manual INR deposit submit (`POST /inr/deposits/manual`) | `sensitiveRateLimiter` |
| everything else | `globalRateLimiter` |

Limits are Redis-backed (shared across replicas). 429 responses are generic
(`"Too many requests, please try again later."`). Login returns a generic
`INVALID_CREDENTIALS`, and forgot-password always succeeds, so neither leaks
account existence.

## 4. HTTP / headers / logs

- `helmet` security headers; `x-powered-by` disabled; `trust proxy` = 1.
- CORS strictly allowlisted from `CORS_ORIGINS`; credentials enabled; disallowed
  browser origins rejected (`CORS_FORBIDDEN`).
- Bounded request bodies (`BODY_LIMIT`).
- `/health`, `/ready`, `/version` expose only status/version/node — no secrets.
- Logger redaction scrubs authorization/cookies, passwords, OTP/TOTP, tokens,
  refresh hashes, secrets, private keys, KMS refs, RPC URLs, provider API keys,
  DB/Redis URLs, and webhook signature headers.

## 5. "Do not use in production" (staging/demo only)

- `NODE_ENV` other than `production`; `CORS_ORIGINS` with `localhost`/wildcards.
- `change_me_*` JWT secrets; `dev-only-*` KYC/Razorpay secrets.
- `MAIL_PROVIDER=log`; `REQUIRE_EMAIL_VERIFICATION=false`.
- Any `*_PROVIDER=mock`; `WITHDRAWAL_SIGNER=mock`.
- Admin login with TOTP disabled / `000000`.
- Any `ALLOW_*` override set to `true`.

## 6. Known constraints (not enabled by this stage)

- Live withdrawal signing is intentionally unimplemented; until a KMS/HSM/MPC
  signer lands, a production launch that runs withdrawals must consciously set
  `ALLOW_MOCK_WITHDRAWAL_SIGNER=true` (no real broadcast).
- Live KYC vendor is unimplemented (`KYC_PROVIDER=mock`); set
  `ALLOW_MOCK_PROVIDERS=true` to accept that risk until a vendor is wired.
