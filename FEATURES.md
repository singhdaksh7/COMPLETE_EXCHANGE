# Completed Features — Exchange MVP

A summary of the modules delivered in this MVP. The backend follows a strict
layered architecture (Routes → Validation → Controller → Service → Repository →
Prisma/Postgres, with Redis for cache/locks/rate-limiting) and a uniform
response envelope. The frontend is a Next.js (App Router) app with React Query.

Legend: **API** = public user API (`:4000/api/v1`) · **Admin** = admin API
(`:4001/admin/v1`).

---

## 1. Authentication
- Email + password registration and login; Argon2id password hashing
  (`@node-rs/argon2`).
- Short-lived access JWT + **rotating** refresh tokens stored **hashed**, with
  refresh-reuse detection (family revocation) and **instant revocation** via a
  Redis denylist checked on every authenticated request.
- Email-verification gate on login; per-account brute-force lockout.
- Strict CORS allowlist, Helmet headers, body-size limits, per-route rate limits
  (tighter on auth).

## 2. Admin RBAC
- Separate admin identity and API surface with its own JWT scope and (optional)
  TOTP second factor.
- Role/permission model seeded as reference data: `SUPER_ADMIN`, `COMPLIANCE`,
  `FINANCE`, `SUPPORT`, `READ_ONLY`, each mapped to fine-grained permission
  codes (e.g. `kyc.review`, `withdrawal.approve`, `ledger.view`).
- Permission-checked admin routes via authorize middleware; admin actions are
  written to an append-only admin log.

## 3. KYC
- User KYC profile submission (full name, DOB, PAN) with a mock DigiLocker
  provider abstraction.
- Document upload intents; tiered KYC (`kyc_tier`) gating sensitive actions.
- **Admin** review queue with approve/reject decisions; trading and withdrawals
  require an approved tier-1 KYC.

## 4. Ledger (double-entry)
- Append-only, double-entry accounting engine: every money movement posts
  balanced DEBIT/CREDIT lines across user/available, user/locked, system, and
  fee-revenue accounts.
- **Idempotent** postings keyed on a reference id (dedupe on retry); serializable
  write-conflict retry. All amounts are exact decimals — never floats.
- Per-asset wallet views (available / locked / total) are derived from the
  ledger, so balances always reconcile to posted entries.

## 5. Razorpay INR deposits
- INR deposit intents via a **mock** Razorpay provider (offline, deterministic)
  with a clean swap-in path for the **live** provider.
- HMAC-signed inbound webhook (`payment.captured`) verification with replay-safe
  event dedupe; on capture the ledger credits the user's INR balance.
- Configurable deposit min/max bounds.

## 6. Wallets
- Per-asset balances (available/locked/total) and a combined wallet overview.
- TRC20/ERC20/BEP20 asset-chain reference data; per-user **deposit address**
  derivation (mock signer abstraction) for crypto deposits.
- Wallet-scoped ledger activity feed (portfolio history).

## 7. TRC20 deposit scanner
- TRON chain scanner that watches for incoming USDT (TRC20) transfers to user
  deposit addresses, with a mock TRON provider for offline demos.
- Confirmation tracking against required confirmations + reorg buffer; on
  finality the ledger credits the user. Chain cursor + admin scanner-health
  view.

## 8. Withdrawals
- USDT withdrawals with an **allowlisted** (whitelisted) destination address
  requirement.
- **Dual control**: a withdrawal is requested by the user and must be **approved
  by an admin** (`withdrawal.approve`) before broadcast.
- Background worker: broadcast (mock signer + nonce management) → confirmation →
  `COMPLETED`, with a system-wide withdrawals kill-switch flag.

## 9. INR ↔ USDT conversion
- Quote → execute flow with a mock price provider, spread (bps), fee, and TDS
  computation; quotes expire.
- Idempotent conversion execution settles atomically through the ledger
  (INR↔USDT), updating both balances.

## 10. Spot trading (USDT-INR)
- Full limit/market order matching engine (BUY/SELL), price-time priority,
  deterministic matching serialized per market.
- Fund **locking** on order placement, **fee** computation (maker/taker bps),
  surplus release on close, and **idempotent** trade settlement through the
  ledger (deterministic fill ids).
- Order lifecycle: open orders, order history, trade history, cancel; aggregated
  **order book**; tick/step/min-notional validation. **Admin** monitoring of
  markets, orders, and trades.

## 11. Real-time (WebSockets)
- Socket.IO layer fed by an in-process domain event bus, decoupled from the
  matching hot path (publishing never blocks or rolls back a settlement).
- Per-market room subscriptions push: `orderbook.updated`, `trade.executed`,
  `order.updated` (per user), and `balance.updated` (per user).
- Frontend `/trade` consumes pushes straight into the React Query cache and
  **falls back to REST polling** automatically when the socket drops (a `Live` /
  `Polling` badge reflects the state).

## 12. Charts & public market data
- **Public, read-only** market-data APIs (no auth, no user/fee/ownership data),
  derived from the trades tape:
  - `GET /markets/:symbol/trades` — recent public trade tape.
  - `GET /markets/:symbol/ticker` — 24h last price, high/low, volume, and price
    change.
  - `GET /markets/:symbol/candles?interval=1m|5m|15m|1h|1d` — OHLCV candles
    computed on the fly from trades (the `candles`/`market_tickers` tables are
    reserved for a future pre-aggregation worker).
- `/trade` page renders a **candlestick chart** (`lightweight-charts`) with an
  interval selector plus a **24h ticker** header (last price, signed change %,
  24h high/low, base/quote volume). Ticker and candles refresh on the
  `trade.executed` socket event, with polling fallback.

---

## Cross-cutting
- **Idempotency** on all money-moving POSTs (Idempotency-Key header + per-domain
  reference dedupe).
- **Auditing**: forensic audit records on sensitive user/admin actions.
- **Validation** with zod at the edge; uniform error envelope with stable
  machine-readable codes.
- **Tests**: backend unit + integration suite (matching engine, ledger, auth,
  KYC, deposits, withdrawals, scanner, conversion, trading, public market data).
- **Dev verification harnesses**: `scripts/demo-e2e.ts` (full non-trading flow)
  and `scripts/trading-demo.ts` (two-user trading flow) — see `DEMO.md`.
