# EXORA — Security Smoke Checklist (cybersecurity audit readiness)

Manual checks to run against a deployed environment before/during an audit. Each
item lists **how to test** and the **expected** result. Fill in the base URLs and
tokens for the environment under test.

```
API   = https://<api-base>/api/v1          # user API   (cex-staging-api)
ADMIN = https://<admin-base>/admin/v1       # admin API  (cex-staging-admin)
UTOK  = <user JWT>                          # a normal KYC-approved user
UTOK2 = <second user JWT>                   # a DIFFERENT user (for IDOR tests)
ATOK  = <admin JWT>                         # an admin with inr.view / inr.approve
```

> Platform posture under test: **INR_ONLY** — crypto deposit/withdrawal/wallet are
> globally disabled; INR deposit/withdrawal + basic trading are enabled.

---

## 1. Error sanitization (no raw DB/stack leakage)
- [ ] Trigger a validation error: `POST $API/inr/withdrawals` with `{}` (authed).
      **Expect** `422 VALIDATION_ERROR` with field details — **no** stack, file paths, or SQL.
- [ ] Trigger a not-found: `GET $API/inr/withdrawals/00000000-0000-4000-8000-000000000000` (authed).
      **Expect** `404` with `{ "success": false, "error": { "code": "NOT_FOUND", ... } }`.
- [ ] Force a duplicate/constraint path where possible → **Expect** `409 CONFLICT` "Resource already exists",
      **never** a raw Prisma `P2002` message or column names.
- [ ] Any response body must **never** contain: `prisma`, `PrismaClient`, a stack trace, `node_modules`,
      `DATABASE_URL`, or secret values.
- [ ] Every response carries an `x-request-id` header (correlation id for debugging). Confirm it is present.
- Note: staging runs `NODE_ENV=production`, so unexpected 500s return the opaque
  `"An unexpected error occurred"` (`INTERNAL_ERROR`) — the underlying message is **not** sent to the client.

## 2. Feature gates (cannot be bypassed by calling the API directly)
- [ ] Crypto wallet networks: `GET $API/wallets/networks?asset=USDT` (UTOK) → **403** `FEATURE_DISABLED_FOR_USER`.
- [ ] Crypto deposit address: `POST $API/wallets/addresses {"chain":"TRON"}` (UTOK) → **403**.
- [ ] Crypto master-wallet deposit networks: `GET $API/deposits/crypto/networks` (UTOK) → **403** (or feature-disabled).
- [ ] INR deposit when `canDepositInr` is OFF for the user → `POST $API/inr/deposits/manual` → **403** `FEATURE_DISABLED_FOR_USER`.
- [ ] INR withdrawal when `canWithdrawInr` is OFF → `POST $API/inr/withdrawals` → **403** `FEATURE_DISABLED_FOR_USER`.
- [ ] Trading when `canTradeSpot` is OFF → `POST $API/orders` → **403**; `DELETE $API/orders/<id>` → **403** (cancel requires `canCancelOrders`).
- [ ] `GET $API/auth/me` → `features` shows crypto flags `false` and `globalFeatureStatus.mode = "INR_ONLY"`.

## 3. RBAC / admin protection
- [ ] Hit any admin route with a **user** token: `GET $ADMIN/inr/withdrawals` with `Authorization: Bearer $UTOK` → **401/403** (user JWT is not an admin token).
- [ ] Hit an admin route with **no** token → **401**.
- [ ] Admin mutation permission is enforced (an admin lacking `inr.approve` is blocked):
      `POST $ADMIN/inr/withdrawals/<id>/approve` / `/reject` / `/mark-paid` → **403** without `inr.approve`.
- [ ] Same for INR deposit: `POST $ADMIN/inr/deposits/<id>/approve|reject` requires `inr.approve`.
- [ ] KYC decisions: `POST $ADMIN/kyc/<userId>/decision` requires the KYC decision permission.
- [ ] Feature-control changes: `PATCH $ADMIN/users/<userId>/controls` requires `users.controls.update` (and a `reason`).

## 4. IDOR (no cross-user data access)
- [ ] INR withdrawal: as UTOK2, `GET $API/inr/withdrawals/<UTOK's withdrawal id>` → **404** (not another user's row).
- [ ] INR deposit: as UTOK2, `GET $API/inr/deposits/<UTOK's deposit id>` → **404**.
- [ ] Wallet/balance: `GET $API/wallets/INR` returns only the **caller's** balance (no userId param accepted).
- [ ] KYC: `GET $API/kyc` returns only the caller's KYC; there is no `GET /kyc/:otherUserId` on the user API.
- [ ] Orders/trades: `GET $API/orders`, `GET $API/trades` return only the caller's rows.
- [ ] All cross-user attempts return **404/403** with a safe envelope — never another user's data.

## 5. Rate limits (existing Redis-backed limiters)
- [ ] Login brute force: repeat `POST $API/auth/login` past the auth cap → **429** `RATE_LIMITED`.
- [ ] Register / OTP / password-reset: covered by the same `authRateLimiter`.
- [ ] KYC submit: `POST $API/kyc` is throttled (`authRateLimiter`).
- [ ] INR deposit create: `POST $API/inr/deposits` and `/inr/deposits/manual` are throttled (`sensitiveRateLimiter`).
- [ ] INR withdrawal request: `POST $API/inr/withdrawals` is throttled (`sensitiveRateLimiter`).
- [ ] Admin sensitive actions: INR deposit/withdrawal approve/reject/mark-paid throttled (`adminSensitiveRateLimiter`).
- [ ] `429` responses include standard `RateLimit-*` headers.

## 6. Security headers / CORS
- [ ] Response headers include (helmet): `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
      `X-Frame-Options` (or frameguard), `Referrer-Policy`, `Cross-Origin-Resource-Policy`, and `Permissions-Policy`.
- [ ] CORS allowlist: a request with `Origin: https://evil.example` → rejected (`CORS_FORBIDDEN`); the configured
      frontend/admin origins are allowed. **No wildcard `*` with credentials.**
- [ ] Env validation requires `CORS_ORIGINS` to be non-empty in production-like envs (staging runs `NODE_ENV=production`).
- [ ] CloudFront/static frontend still loads (the API CORS change does not serve the frontend assets).

## 7. Admin audit logs
- [ ] After a KYC approve/reject → an audit entry + admin log row exists for the action.
- [ ] After an INR deposit approve/reject → audit + admin log recorded (actor, target, before/after).
- [ ] After an INR withdrawal **approve / reject / mark-paid** → audit + admin log recorded (actor, amount, UTR on paid).
- [ ] After a feature-control change → audit + admin log records the field-level diff + reason.
- [ ] Inspect via `GET $ADMIN/operations/audit` (or the admin Audit log screen) and confirm entries are present and non-empty.

## 8. Direct-bypass sanity
- [ ] Frontend hiding is **not** the boundary: every check above is enforced by the API even when the UI element is hidden.
- [ ] A blocked feature reached by deep link shows the `AccessUnavailable` page (no blank/broken screen).

---

### Notes / known local-env caveat
- `backend/test/unit/security-hardening.test.ts` currently fails **locally** with `SERVICE_UNAVAILABLE`
  ("Authentication token store unavailable") because it needs a running **Redis**; this is a local
  environment limitation, **not** an application security regression. It passes where Redis is available
  (CI / deployed env). The rate limiters and token store are Redis-backed by design.
