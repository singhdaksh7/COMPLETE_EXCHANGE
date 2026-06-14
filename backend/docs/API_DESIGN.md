# CEX API Design — v1 (companion to `openapi.yaml`)

The machine-readable contract is **`backend/docs/openapi.yaml`** (OpenAPI 3.1, lints
clean with `@redocly/cli`). This doc covers the cross-cutting concerns that are awkward
to express purely in OpenAPI: **versioning, validation rules, rate limits, idempotency,
auth/step-up, and the error catalog**. It is derived from the frozen DB (`schema.prisma`)
and the foundation conventions (`ARCHITECTURE.md §6`, `src/utils/response.ts`,
`src/lib/errors.ts`, `src/middleware/idempotency.ts`).

> Scope: **specification only — no implementation code.**

---

## 1. Versioning strategy

- **URL-major versioning.** Public API under `/api/v1`, admin under `/admin/v1` on a
  **separate host** (`admin-api.*`). The major version is the only breaking-change axis.
- **What is a breaking change** (→ new major `/v2`): removing/renaming a field or endpoint;
  tightening a type/constraint; changing an enum's meaning; changing the envelope shape;
  changing auth semantics. **Non-breaking** (ship in-place on `v1`): adding endpoints,
  adding optional request fields, adding response fields, adding a new `error.code`,
  adding a new enum value *that clients already treat as open*.
- **Enums are forward-compatible.** Clients MUST treat unknown enum values and unknown
  `error.code`s as a safe default (don't crash). New `error.code`s can appear within a major.
- **Deprecation policy.** A field/endpoint is marked `deprecated: true` in the spec with a
  `Sunset` HTTP header and a `Deprecation` header on responses; minimum **6-month** overlap
  before removal in the next major. Deprecations are announced via the changelog.
- **Lifecycle of a major:** `vN` and `vN+1` run **side by side** during the overlap window;
  `vN` then becomes read-only/410 on a published sunset date.
- **Spec is the source of truth.** Generated SDKs (Flutter, admin SPA) are rebuilt from
  `openapi.yaml` on every change; CI fails if the committed spec and route definitions drift.
- **Compatibility gate in CI:** `redocly lint` + a spec-diff check (`oasdiff`) that classifies
  each PR's change as breaking / non-breaking and blocks breaking changes on a frozen major.

---

## 2. DTO definitions

DTOs are the `components/schemas` in `openapi.yaml` — request DTOs (`*Request`), entity DTOs,
and success **envelopes** (`*Envelope`). Highlights:

| Concern | Modeling decision |
|--------|-------------------|
| **Money** | `Decimal` = **string**, pattern `^-?\d+(\.\d+)?$`. Never a JSON number — mirrors the `NUMERIC` ledger; scale is asset-defined (INR 2, USDT 6). |
| **IDs** | `Uuid` (`format: uuid`); int64 ids (`ledger_entries.id`, `trades.seq`) are strings. |
| **Envelope** | every success body is `{ success: true, data, meta? }`; errors are `{ success:false, error:{code,message,details?} }`. Encoded via per-resource `*Envelope` schemas with `success: { const: true }`. |
| **Pagination** | list `data = { items[], nextCursor }` + optional `meta` (`PageMeta`). |
| **Closed shapes** | every `*Request` is `additionalProperties: false` (reject unknown keys, matching the foundation's `.strict()` zod). |
| **Nullable** | uses 3.1 type arrays, e.g. `type: [string, 'null']`. |
| **Order book / candles** | compact tuple encodings: `PriceLevel = [price, qty]`, `Candle = [openTime,o,h,l,c,vol]`. |

---

## 3. Validation rules (authoritative summary)

Validation is layered: **(a)** OpenAPI/zod schema validation (422 `VALIDATION_ERROR` with
field `details`), then **(b)** business-rule validation (domain error codes). Schema rules
are in the spec; the rules that need prose:

**Field-level (schema):**
- `email` RFC email, ≤254; `phone` E.164 `^\+?[1-9]\d{7,14}$`.
- `password` 10–128, must contain lower + upper + digit (foundation rule).
- `totp` `^[0-9]{6}$`; KYC `pan` `^[A-Z]{5}[0-9]{4}[A-Z]$`; `ifsc` `^[A-Z]{4}0[A-Z0-9]{6}$`;
  `pincode` `^[1-9][0-9]{5}$`; `sha256` `^[a-f0-9]{64}$`.
- `Idempotency-Key` header 8–255 chars.
- `limit` 1–100 (default 20); `market` symbol `^[A-Z0-9]+-[A-Z0-9]+$`.
- Money fields: decimal string, `> 0` for all create/transfer amounts.

**Business-rule (server, beyond schema):**
- **Orders** (`POST /orders`): `LIMIT` ⇒ `price`+`quantity`; `MARKET BUY` ⇒ `quoteBudget`;
  `MARKET SELL` ⇒ `quantity`; `STOP_LIMIT` ⇒ `stopPrice`+`price`+`quantity`. `price`%`tickSize`==0
  (`TICK_SIZE_VIOLATION`), `quantity`%`stepSize`==0 (`STEP_SIZE_VIOLATION`),
  `price*qty ≥ minNotional` (`MIN_NOTIONAL`), market `ACTIVE` (`MARKET_HALTED`),
  `POST_ONLY` must not cross (`POST_ONLY_WOULD_CROSS`). Maps to the DB `orders_*` CHECKs.
- **Withdrawals**: KYC `APPROVED` (`KYC_REQUIRED`), destination whitelisted & past cooldown
  (`ADDRESS_NOT_WHITELISTED`/`ADDRESS_IN_COOLDOWN`), step-up present (`STEP_UP_REQUIRED`),
  amount ≤ available & within tier (`INSUFFICIENT_BALANCE`/`LIMIT_EXCEEDED`),
  `net = amount − fee − tds` (DB CHECK), kill-switch off (`WITHDRAWALS_DISABLED`).
- **Conversions**: quote exists & unexpired (`QUOTE_NOT_FOUND`/`QUOTE_EXPIRED`).
- **INR withdrawal**: bank account verified (`BANK_NOT_VERIFIED`).
- **Admin withdrawal decision**: dual control — second approver ≠ first
  (`DUAL_CONTROL_SAME_APPROVER`, DB CHECK `approved_by <> approved_by_2`).

---

## 4. Authentication & step-up

| Aspect | Rule |
|-------|------|
| Access token | JWT, **10–15 min**, `Authorization: Bearer`. Scheme `UserBearer`. |
| Refresh | rotating, hashed at rest, reuse-detected (revokes the family → `REFRESH_REUSE_DETECTED`). |
| 2FA | TOTP; login is two-step when enabled (`/auth/login` → `TotpChallenge` → `/auth/login/totp`). |
| Step-up | `POST /auth/step-up` → short-lived `X-Step-Up-Token` (≈5 min). Required by ops with `x-step-up: true`: withdrawals, withdrawal-address add/remove, 2FA changes, bank-account add, INR withdrawal. Missing ⇒ `403 STEP_UP_REQUIRED`. |
| Admin | separate host; `AdminBearer`; **TOTP mandatory** at login; every op declares `x-required-permission` (RBAC code, e.g. `withdrawal.approve`). Missing perm ⇒ `403 FORBIDDEN`. |

---

## 5. Idempotency

- Money-moving `POST`s declare **`x-idempotent: required`** and take the **`Idempotency-Key`**
  header (8–255). Server stores `(user_id, endpoint, key) → (status, body)`.
- **Replay** of a completed key → original response + `Idempotent-Replayed: true`.
- **In-flight** duplicate → `409 IDEMPOTENCY_IN_PROGRESS`.
- 5xx releases the key (client may retry the same key). Missing key on a required op → `400 BAD_REQUEST`.
- Endpoints requiring it: `POST /wallets/addresses`, `POST /withdrawals`,
  `POST /withdrawal-addresses`, `POST /inr/deposits`, `POST /inr/withdrawals`,
  `POST /inr/conversions`, `POST /orders`, `POST /admin/withdrawals/{id}/decision`,
  `POST /admin/reconciliations`. (Orders additionally accept a per-user `clientOrderId`,
  unique partial index `(user_id, client_order_id)`.)

---

## 6. Rate limits

Redis token-bucket keyed by principal + route policy. Response headers on every call:
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; `429 RATE_LIMITED`
adds `Retry-After`. Each operation declares `x-rate-limit: { policy, limit, window }`.

| Policy | Typical limit | Applies to |
|--------|---------------|-----------|
| `auth` | 5–30 / 1–5 min | login, register, refresh, step-up, admin login |
| `sensitive` | 5–10 / 5–10 min | 2FA changes, KYC submit, bank/address add, cancels |
| `standard` | 20–120 / min | authenticated reads & profile writes |
| `trading` | 60–240 / min | orders, trades, quotes |
| `public` | 120–240 / min | market data (unauthenticated) |
| `admin` | 60–120 / min | admin host endpoints |

> Withdrawal creation rides `sensitive` + step-up + idempotency; bursts beyond the bucket
> are rejected pre-business-logic (middleware order in `ARCHITECTURE.md §6.2`).

---

## 7. Error catalog

HTTP status → envelope `error.code` (the full enum is `ErrorCode` in the spec; clients
switch on `code`). Cross-cutting mapping (from `src/lib/errors.ts`):

| HTTP | Codes |
|------|-------|
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `INVALID_TOTP`, `CHALLENGE_EXPIRED`, `INVALID_REFRESH_TOKEN`, `REFRESH_REUSE_DETECTED`, `ACCOUNT_LOCKED`, `ACCOUNT_FROZEN`, `EMAIL_NOT_VERIFIED` |
| 403 | `FORBIDDEN`, `STEP_UP_REQUIRED`, `KYC_REQUIRED`, `ADDRESS_NOT_WHITELISTED`, `ADDRESS_IN_COOLDOWN`, `WITHDRAWALS_DISABLED`, `INR_DISABLED`, `BANK_NOT_VERIFIED` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT`, `IDEMPOTENCY_IN_PROGRESS`, `EMAIL_TAKEN`, `PHONE_TAKEN`, `TOTP_ALREADY_ENABLED`, `KYC_IN_REVIEW`, `KYC_ALREADY_APPROVED`, `ADDRESS_ALREADY_LISTED`, `WITHDRAWAL_NOT_CANCELLABLE`, `WITHDRAWAL_NOT_APPROVABLE`, `DUAL_CONTROL_SAME_APPROVER`, `DUPLICATE_CLIENT_ORDER_ID`, `ORDER_NOT_CANCELLABLE`, `MARKET_EXISTS` |
| 422 | `VALIDATION_ERROR`, `INSUFFICIENT_BALANCE`, `LIMIT_EXCEEDED`, `AMOUNT_BELOW_MINIMUM`, `QUOTE_EXPIRED`, `QUOTE_NOT_FOUND`, `MARKET_HALTED`, `TICK_SIZE_VIOLATION`, `STEP_SIZE_VIOLATION`, `MIN_NOTIONAL`, `POST_ONLY_WOULD_CROSS` |
| 429 | `RATE_LIMITED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 500 | `INTERNAL_ERROR` (non-operational; paged) |

---

## 8. Endpoint index (10 modules)

| Module | Endpoints |
|--------|-----------|
| Authentication | `POST /auth/register`, `/auth/login`, `/auth/login/totp`, `/auth/refresh`, `/auth/logout`, `/auth/step-up`, `/auth/totp/enroll`, `/auth/totp/activate` |
| Users | `GET/PATCH /users/me`, `GET /users/me/limits`, `GET /users/me/sessions`, `DELETE /users/me/sessions/{id}` |
| KYC | `GET/POST /kyc`, `GET/POST /kyc/documents` |
| Wallets | `GET /wallets`, `GET /wallets/{asset}`, `GET /wallets/{asset}/ledger`, `GET/POST /wallets/addresses` |
| Deposits | `GET /deposits`, `GET /deposits/{id}` |
| Withdrawals | `GET/POST /withdrawals`, `GET /withdrawals/{id}`, `POST /withdrawals/{id}/cancel`, `GET/POST /withdrawal-addresses`, `DELETE /withdrawal-addresses/{id}` |
| INR Ledger | `POST /inr/deposits`, `POST /inr/withdrawals`, `GET /inr/transactions`, `GET/POST /inr/bank-accounts`, `POST /inr/quotes`, `POST /inr/conversions` |
| Orders + Market Data | `GET/POST /orders`, `GET/DELETE /orders/{id}`, `GET /markets`, `GET /markets/{symbol}/orderbook|ticker|candles|trades` |
| Trades | `GET /trades`, `GET /trades/{id}`, `GET /markets/{symbol}/trades` |
| Admin | `POST /admin/auth/login`, `GET /admin/users`, `POST /admin/users/{id}/freeze`, `GET /admin/kyc`, `POST /admin/kyc/{userId}/decision`, `GET /admin/withdrawals`, `POST /admin/withdrawals/{id}/decision`, `GET/POST /admin/reconciliations`, `GET /admin/audit-logs`, `POST /admin/markets`, `PATCH /admin/markets/{symbol}/status`, `PUT /admin/system-flags/{key}` |
