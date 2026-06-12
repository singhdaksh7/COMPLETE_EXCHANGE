# Centralized Crypto Exchange (CEX) — Software Architecture Document

**Product:** INR ↔ USDT exchange for Indian users
**Audience:** Senior engineering review
**Status:** v1 architecture (pre-implementation)
**Scope:** TRC20 / ERC20 / BEP20 USDT, INR fiat rails, KYC, wallets, admin, Flutter app

---

## 0. Reading guide & non-negotiables

Before the architecture: a few decisions are load-bearing. If the team disagrees with these, the rest of the document changes.

1. **This is a custodial financial system holding other people's money.** Every design choice is biased toward *correctness, auditability, and reversibility of mistakes* over speed of shipping. A bug in a stateless web app loses a request; a bug here loses funds and is often irreversible on-chain.
2. **Money never moves on a single service's say-so.** Balance changes are double-entry ledger postings inside database transactions. We do not `UPDATE balance SET amount = amount + x`. (Section 3 & 17.)
3. **Hot wallet keys are the single highest-value target in the system.** They are not in the app database, not in `.env`, not in application memory longer than necessary. (Section 7 & 10.)
4. **India-specific compliance is a first-class requirement, not an afterthought.** FIU-IND registration, PMLA recordkeeping, 1% TDS under §194S, 30% VDA tax reporting, and the fragile state of INR banking rails for crypto materially shape the design. (Section 16.)
5. **Idempotency everywhere money or chain state is involved.** Payment webhooks, deposit crediting, withdrawal broadcasts — all must be safe to replay. (Sections 6, 8, 9.)

---

## 1. High-Level System Architecture

### 1.1 Logical tiers

```
                          ┌──────────────────────────────┐
                          │      Clients                  │
                          │  Flutter app  |  Admin SPA    │
                          └──────────────┬───────────────┘
                                         │ HTTPS / TLS 1.3
                          ┌──────────────▼───────────────┐
                          │   Nginx (reverse proxy, TLS,  │
                          │   rate-limit, WAF front)      │
                          └──────────────┬───────────────┘
                                         │
                 ┌───────────────────────┼────────────────────────┐
                 │                        │                        │
        ┌────────▼────────┐     ┌─────────▼─────────┐    ┌─────────▼─────────┐
        │  API Gateway /  │     │   Admin API       │    │  Webhook Ingress  │
        │  Public API     │     │   (separate authz)│    │  (PG callbacks)   │
        │  (Express)      │     │                   │    │                   │
        └────────┬────────┘     └─────────┬─────────┘    └─────────┬─────────┘
                 │                         │                         │
                 └───────────┬─────────────┴──────────┬─────────────┘
                             │                          │
                    ┌────────▼─────────┐       ┌────────▼─────────┐
                    │  Core services   │       │  Redis           │
                    │  (modular        │◄─────►│  cache / locks / │
                    │  monolith)       │       │  queues / rates  │
                    └────────┬─────────┘       └──────────────────┘
                             │
              ┌──────────────┼───────────────────────────────┐
              │              │                                │
     ┌────────▼──────┐ ┌─────▼────────┐            ┌──────────▼─────────┐
     │ PostgreSQL    │ │  Job workers │            │  Blockchain layer  │
     │ (primary +    │ │ (BullMQ):    │            │  Deposit scanners  │
     │  read replica)│ │ deposits,    │◄──────────►│  Withdrawal signer │
     │  ledger of    │ │ withdrawals, │            │  (isolated host)   │
     │  record       │ │ KYC, notify  │            │  Node RPCs / APIs  │
     └───────────────┘ └──────────────┘            └────────────────────┘
                                                            │
                              ┌─────────────────────────────┼──────────────┐
                              │ TRON full/RPC   EVM RPC (ETH)   BSC RPC     │
                              │ (TronGrid)      (Infura/own)   (own/QuickNode)
                              └────────────────────────────────────────────┘
```

### 1.2 Trust zones

The system is split into **three trust zones** with hard network boundaries:

| Zone | Contents | Inbound from internet? | Holds private keys? |
|------|----------|------------------------|---------------------|
| **DMZ / Public** | Nginx, public API, webhook ingress | Yes | No |
| **Application** | Core services, job workers, Redis, Postgres | No (only from DMZ) | No |
| **Signing / Treasury** | Withdrawal signer, key custody (HSM/KMS), hot-wallet key material | No — outbound RPC only, no inbound API | Yes |

The signing zone is the crown-jewel boundary. The application zone can *request* a withdrawal (write an intent row); it cannot *sign or broadcast*. The signer polls/consumes approved withdrawal intents, signs in isolation, and writes back results. Compromise of the public API must not be sufficient to move funds.

### 1.3 Key flows in one line each

- **Registration/Auth** → public API → user + auth tables; sessions in Redis.
- **KYC** → upload to object storage (S3/Spaces) → KYC provider (or manual admin) → status state machine.
- **INR deposit** → payment gateway → signed webhook → ledger credit (idempotent).
- **INR↔USDT convert** → quote (Redis-cached price + spread) → atomic two-leg ledger posting.
- **Crypto deposit** → per-user derived address → chain scanner detects → confirmations → ledger credit.
- **Crypto/INR withdrawal** → user intent → risk/limit checks → admin/auto approval → signer broadcasts → confirmation → ledger debit finalized.

---

## 2. Component Diagram — Explanation

### 2.1 Public API (Express modular monolith)
Single deployable Node.js process exposing the user-facing REST API. Internally organized into modules (auth, kyc, wallet, ledger, conversion, payments, withdrawals). All write paths that touch money go through the **Ledger module**, which is the only code allowed to post balance changes.

### 2.2 Admin API
Logically the same codebase but a **separately mounted router with its own auth, RBAC, and rate limits**, ideally deployed as its own process/container and exposed on a separate hostname (e.g. `admin-api.internal`) reachable only via VPN / IP allowlist. Admins approve KYC, approve withdrawals, freeze accounts, and read audit logs. Admin actions are themselves audited.

### 2.3 Webhook Ingress
Dedicated endpoint(s) for payment-gateway callbacks. Verifies provider HMAC signature, persists the raw event verbatim, enqueues processing, and returns `200` fast. Processing is asynchronous and idempotent so the gateway can safely retry.

### 2.4 Core services (domain modules)
- **Identity & Auth** — registration, login, JWT issuance, 2FA, device/session management.
- **KYC** — document intake, provider orchestration, status machine, AML screening hooks.
- **Wallet** — HD address derivation, address-to-user mapping, balance projection.
- **Ledger** — double-entry accounting; the source of truth for all balances.
- **Conversion** — price quoting, spread/fee, INR↔USDT execution.
- **Payments** — INR deposit/withdrawal orchestration with the gateway.
- **Withdrawals** — intent creation, risk checks, approval workflow, signer handoff.
- **Notifications** — push/email/SMS via providers.
- **Audit** — append-only event recording.

### 2.5 Job workers (BullMQ on Redis)
Out-of-band processing: chain scanning, confirmation tracking, withdrawal broadcast/confirm, KYC polling, payout reconciliation, notification fan-out, and scheduled compliance reports. Workers are horizontally scalable and idempotent.

### 2.6 Blockchain layer
- **Deposit scanners** — per-chain processes that watch new blocks for transfers to our deposit addresses (Section 8).
- **Withdrawal signer** — isolated service holding hot-wallet keys; the only component that signs (Section 9).
- **RPC providers** — TronGrid for TRON, Infura/Alchemy or self-hosted geth for Ethereum, QuickNode/self-hosted for BSC. Always run with a fallback provider.

### 2.7 Data stores
- **PostgreSQL** — ledger of record, all relational state. Primary + read replica.
- **Redis** — cache, distributed locks, rate limiting, session store, BullMQ backing store, live price cache.
- **Object storage** — KYC documents (encrypted, private bucket, signed URLs).

---

## 3. Database Design (principles)

The full DDL is in Section 17. The principles that govern it:

### 3.1 Double-entry ledger — the heart of the system
Balances are **never stored as a mutable column you increment**. Instead:

- Every user has one or more **accounts** (e.g. `user:123:INR`, `user:123:USDT`). The exchange itself has internal accounts (fee revenue, hot-wallet reserve, gateway settlement clearing, etc.).
- Every financial event creates one **ledger transaction** containing ≥2 **ledger entries** whose signed amounts **sum to zero**.
- A user's balance is `SUM(entries.amount) WHERE account_id = ?`. For performance we maintain a **balances projection** table updated *inside the same DB transaction* as the entries, with a periodic invariant check (`projection == SUM(entries)`).

Why: this makes every balance explainable ("show me every entry that produced this number"), makes bugs detectable (the sum-to-zero and projection invariants), and is what auditors and regulators expect.

### 3.2 Money representation
- All monetary amounts stored as **`NUMERIC` (arbitrary precision)**, never floats. INR with scale 2; USDT with scale 6 (chain-native). On-chain values stored additionally as the **integer base unit** (e.g. USDT has 6 decimals on TRON/BSC, 6 on ETH) to avoid any rounding ambiguity vs the chain.
- A single `currency`/`asset` reference table defines decimals per asset/chain.

### 3.3 State machines, not boolean flags
KYC, deposits, withdrawals, conversions, and payments each have an explicit `status` enum and only allow defined transitions, enforced in code and (where possible) by check constraints. Status changes are logged.

### 3.4 Idempotency & uniqueness
- Payment events unique on `(provider, provider_event_id)`.
- On-chain deposits unique on `(chain, tx_hash, log_index)`.
- Client-initiated mutations accept an `Idempotency-Key`, stored unique per user+endpoint.

### 3.5 Soft deletes & immutability
User-facing reference rows use soft delete (`deleted_at`). **Ledger entries and audit logs are append-only — never updated or deleted.** Corrections are *reversing entries*, not edits.

---

## 4. Microservices vs Monolith — Recommendation

### Recommendation: **Modular monolith now, with a pre-carved seam for the signing service.**

Start with **one well-structured deployable** (the Express app organized into the domain modules in §2.4) plus **two physically separate services from day one**:

1. **The withdrawal signer / key custody service** — separated for *security*, not scale. This boundary is non-negotiable even at v1.
2. **The chain scanners / workers** — separated as worker processes (same codebase, different entrypoint) for operational isolation; a stuck scanner must not take down the API.

**Why not microservices now:**
- At early stage, microservices multiply failure modes (distributed transactions, network partitions, eventual-consistency bugs) precisely in the domain — money movement — where you least want them. A double-entry ledger wants strong transactional consistency, which is trivial in one Postgres database and painful across services.
- Team size and velocity: you don't yet have the SRE maturity to run a service mesh. Spend that complexity budget on correctness and compliance.

**Where to split later (natural seams already drawn):**
- KYC/compliance service, notification service, and per-chain wallet services can be peeled off once volume justifies it. Because modules already talk through clear internal interfaces and the ledger is the single integration point, extraction is mechanical rather than a rewrite.

**Hard rule:** even as a monolith, the **public API process and the admin API process should be separate deployments**, and the **signer must be its own host/network**.

---

## 5. Folder Structure

### 5.1 Backend (Node.js + Express + Prisma)

```
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app.ts                 # express app assembly (public)
│   ├── admin-app.ts           # express app assembly (admin)
│   ├── server.ts              # public API entrypoint
│   ├── admin-server.ts        # admin API entrypoint
│   ├── worker.ts              # BullMQ worker entrypoint
│   ├── scanner.ts             # chain scanner entrypoint
│   │
│   ├── config/                # env loading + validation (zod), constants
│   ├── lib/                   # cross-cutting: logger, redis, prisma client, errors
│   │
│   ├── modules/
│   │   ├── auth/              # controllers, services, routes, validators, dto
│   │   ├── kyc/
│   │   ├── wallet/
│   │   ├── ledger/           # <-- only module allowed to post balance changes
│   │   ├── conversion/
│   │   ├── payments/
│   │   ├── withdrawals/
│   │   ├── deposits/
│   │   ├── admin/
│   │   ├── audit/
│   │   └── notifications/
│   │
│   ├── middleware/            # auth, rbac, rate-limit, idempotency, error handler
│   ├── jobs/                  # BullMQ queue defs + processors
│   ├── chains/               # per-chain adapters (tron/, evm/) behind a common interface
│   ├── webhooks/             # payment gateway ingress handlers
│   └── types/
│
├── test/                      # unit + integration (testcontainers for pg/redis)
├── docker/
├── .env.example
└── package.json
```

**Module internal shape (consistent everywhere):**
```
modules/withdrawals/
├── withdrawals.routes.ts
├── withdrawals.controller.ts   # HTTP only, no business logic
├── withdrawals.service.ts      # business logic, transactions
├── withdrawals.repository.ts   # Prisma queries
├── withdrawals.validators.ts   # zod schemas
├── withdrawals.types.ts
└── withdrawals.events.ts       # domain events emitted
```

### 5.2 Mobile (Flutter)

```
mobile/lib/
├── main.dart
├── core/            # env, dio client, interceptors (auth refresh), error model
├── theme/
├── routing/         # go_router
├── data/            # api clients, repositories, models (json_serializable)
├── domain/          # entities, usecases
├── state/           # riverpod/bloc providers
├── features/
│   ├── auth/        ├── kyc/      ├── wallet/
│   ├── deposit/     ├── withdraw/ ├── convert/
│   └── history/
└── widgets/         # shared UI
```

### 5.3 Admin frontend
Separate SPA (React/Next or Flutter Web). Deployed behind VPN/IP allowlist, talks only to the Admin API.

---

## 6. API Architecture

### 6.1 Style & conventions
- **REST/JSON over HTTPS**, versioned: `/api/v1/...`. Admin under `/admin/v1/...` on a separate host.
- **Resource-oriented**: `POST /api/v1/withdrawals`, `GET /api/v1/wallets`, etc.
- **Consistent envelope**:
  ```json
  { "success": true, "data": {...}, "meta": {...} }
  { "success": false, "error": { "code": "INSUFFICIENT_BALANCE", "message": "...", "details": {} } }
  ```
- **Stable machine-readable error codes** (enum), not just HTTP status + prose. The Flutter app switches on `error.code`.
- **Pagination**: cursor-based for lists (`?cursor=&limit=`), not offset, for stable ordering of transaction history.

### 6.2 Cross-cutting middleware (order matters)
1. Request ID + structured logger binding
2. Nginx-passed real IP
3. Rate limiting (Redis token bucket; tighter on auth/withdrawal endpoints)
4. Body parse + size limits
5. JWT verification → load session
6. RBAC / scope check
7. **Idempotency middleware** (for `POST` that move money)
8. Input validation (zod) — reject before business logic
9. Controller → service
10. Centralized error handler → envelope

### 6.3 Idempotency contract
Money-moving `POST`s require an `Idempotency-Key` header. We store `(user_id, endpoint, key) → response_hash, status`. Replays return the original result without re-executing. Webhooks use the provider event id as the natural idempotency key.

### 6.4 Validation & contracts
- **zod** schemas as the single source of validation truth; derive TypeScript types from them.
- Publish an **OpenAPI spec** generated from the route definitions; the Flutter team generates clients from it. Contract is the boundary between mobile and backend.

### 6.5 Auth on the API
- Short-lived **access JWT** (10–15 min) + long-lived **refresh token** (rotating, stored hashed, revocable). Details in Section 11.
- Sensitive actions (withdrawal, changing 2FA, changing withdrawal address) require **step-up auth**: recent password re-entry or TOTP, plus optional **address allowlist with a time delay**.

---

## 7. Wallet Architecture

### 7.1 Model: pooled custody with per-user deposit addresses
This is the standard, scalable CEX pattern.

- **One HD wallet (seed) per chain**, held in the signing zone. From it we derive a **unique deposit address per user per chain** (BIP44-style derivation path, index = an internal sequential wallet counter, *not* the user id, to avoid leaking user counts).
- The app database stores only **public addresses and derivation indices** — never private keys or the seed.
- **Funds are pooled**: user "balances" are ledger numbers, not on-chain per-address balances. Deposits that land on per-user addresses are **swept** to a central hot/cold wallet on a schedule.

### 7.2 Per-chain specifics
| Chain | Address type | Gas/fee asset | Sweep nuance |
|-------|-------------|---------------|--------------|
| **TRC20 (TRON)** | Base58 (T...) | TRX (energy/bandwidth) | Need TRX or staked energy on the sweeping address; cheapest network — usually default deposit option for Indian users. |
| **ERC20 (Ethereum)** | 0x... (secp256k1) | ETH | Highest gas; sweeps must batch / use gas station; consider only crediting when economically worth sweeping. |
| **BEP20 (BSC)** | 0x... (same keyspace as ETH) | BNB | Cheap; BSC and ETH addresses are derived from the same key but **must be tracked per-chain** because a USDT-BEP20 deposit is not the same asset as USDT-ERC20. |

**Critical correctness rule:** the same `0x` address exists on both Ethereum and BSC. A deposit's `(chain, asset)` must be recorded explicitly; never assume chain from address format. A user sending BEP20 USDT to "their ERC20 address" is a real, common support case — handle it as a recoverable mismatch, not a silent credit.

### 7.3 Key custody & wallet tiers
- **Hot wallet** — small operational float for withdrawals; key in the signer (HSM/KMS-backed or encrypted with KMS, decrypted only in signer memory). Auto-payouts capped to hot balance.
- **Warm wallet** — semi-automatic, requires approval, refills hot wallet.
- **Cold wallet** — bulk of reserves, offline / multisig, manual movement only.
- **Sweep destination** — deposits swept from per-user addresses into hot/warm.

Target: hot wallet holds a bounded % of total custody (e.g. ≤ 5–10%); the rest cold. This is the single biggest determinant of how bad a breach can be.

### 7.4 Address derivation service
A small function in the signing zone exposes "give me the next deposit address for chain X" (derive public key from path, return address) **without exposing private keys**. The app calls it once at wallet creation and persists the address. Even better: pre-derive a pool of addresses offline and hand them out, so the public app never needs to call into the signing zone for derivation.

---

## 8. Deposit Detection Architecture

### 8.1 Goal
Credit a user's ledger when an on-chain transfer to their deposit address is confirmed — exactly once, never twice, never on a reorged/dropped tx.

### 8.2 Scanner design (per chain)
A dedicated worker process per chain that runs a **block-by-block cursor**:

```
loop:
  head = rpc.getLatestBlock()
  for blockNumber in (cursor+1 .. head - SAFETY_LAG):
      block = rpc.getBlock(blockNumber)     # with tx + logs
      for each USDT Transfer event to a known deposit address:
          upsert deposit row UNIQUE(chain, tx_hash, log_index) status=DETECTED
      cursor = blockNumber
  persist cursor
  sleep(pollInterval)
```

- **Detection vs crediting are separate.** Detection writes a `DETECTED` deposit row. A second pass promotes it through `CONFIRMING → CONFIRMED` based on confirmation depth, and only on `CONFIRMED` does the ledger get credited.
- **TRON**: watch TRC20 `Transfer` events via TronGrid event API / block scan; confirmations ~19–20 (after SR consensus); fast.
- **EVM (ETH/BSC)**: subscribe/poll for `Transfer(address,address,uint256)` logs filtered by the USDT contract address and our address set. ETH confirmations ~12+, BSC ~15+.

### 8.3 Confirmation & reorg safety
- Each chain has a **required-confirmations** constant. We credit only after depth ≥ threshold.
- We scan only up to `head - SAFETY_LAG` and **re-scan a rolling window** so a reorg that changes a recent block flips the deposit back to `ORPHANED` *before* it was ever credited. Once credited (deep confirmations), reorg risk is negligible for these chains.
- The deposit row's lifecycle: `DETECTED → CONFIRMING → CONFIRMED → CREDITED` (or `ORPHANED`).

### 8.4 Crediting (idempotent, transactional)
On promotion to `CREDITED`, in a **single Postgres transaction**:
1. `SELECT ... FOR UPDATE` the deposit row; bail if already `CREDITED`.
2. Insert ledger transaction: debit `hot/incoming clearing`, credit `user:USDT`.
3. Update balances projection.
4. Set deposit `CREDITED`.
5. Emit notification event.

Because the deposit row is unique on `(chain, tx_hash, log_index)` and we lock it, a replayed scan or double worker cannot double-credit.

### 8.5 Reliability
- Scanners checkpoint their cursor in Postgres (not just Redis) so a restart resumes exactly.
- Dual RPC providers with health-checked failover.
- Alerting on scanner lag (head − cursor > N blocks) and on RPC errors.
- A reconciliation job periodically compares on-chain address balances/sweeps against ledger expectations.

---

## 9. Withdrawal Architecture

The most dangerous flow. Design assumes the application zone is *eventually* compromised and ensures that still isn't enough to drain funds.

### 9.1 Lifecycle (state machine)
```
REQUESTED → RISK_CHECK → PENDING_APPROVAL → APPROVED
         → QUEUED → SIGNING → BROADCAST → CONFIRMING → COMPLETED
   (any →) REJECTED | FAILED | CANCELLED
```

### 9.2 Step by step
1. **REQUESTED** — user submits (asset, chain, address, amount) with step-up auth (TOTP). We validate address format per chain, check the destination isn't an internal/known-bad address, and check it against the user's **address allowlist** (new addresses subject to a cooling-off delay, e.g. 24h, before large withdrawals).
2. **Reserve, don't debit yet** — immediately post a ledger **hold**: move funds from `available` to `locked` for that user (still double-entry; a `locked` sub-account). This prevents double-spend of the same balance across concurrent requests.
3. **RISK_CHECK** — limit checks (daily/weekly caps, KYC tier limits), velocity/anomaly checks, AML screening of destination address, TDS/compliance gating.
4. **Approval** — small amounts under a threshold may **auto-approve**; larger require **admin approval** (and above a higher threshold, **dual admin approval**). Approval thresholds are config, not code.
5. **Signer handoff** — approved intents are picked up by the **signer service in the signing zone**. The app **cannot** sign. The signer:
   - Re-reads the canonical withdrawal intent from the DB (defense in depth: it does not trust a queue message's amounts/addresses; it reads the row and verifies status `APPROVED` + an HMAC/signature the approver attached).
   - Checks hot-wallet balance and per-interval payout caps enforced *inside the signer*.
   - Builds, signs, and broadcasts the tx; writes back `tx_hash`, sets `BROADCAST`.
6. **Confirm** — a worker tracks confirmations; on threshold → `COMPLETED`, finalize ledger (remove `locked`, debit actually leaves the system to `hot wallet outflow` account). On drop/failure → `FAILED`, **release the hold** back to available.

### 9.3 Why the hold-then-finalize pattern
If we debited at request time and the broadcast failed, we'd have to "refund," which is error-prone. Holding (lock) keeps the money in the user's name but unspendable until the on-chain outcome is known, then we finalize or release. Balances are always explainable.

### 9.4 Nonce / sequencing
- **EVM**: the signer manages a per-hot-address **nonce sequence** with a DB-backed counter and a single-flight lock so concurrent withdrawals don't collide or stall on a stuck nonce. Gas estimated with a ceiling; replacement (speed-up) logic for stuck txs.
- **TRON**: ensure sufficient energy/bandwidth (stake TRX) so withdrawals don't fail for resource starvation; otherwise burns TRX unpredictably.
- **Batching** (especially ETH) to amortize gas where the asset supports it.

### 9.5 Controls summary
Per-user limits, global per-interval payout caps in the signer, hot-wallet balance ceiling, address allowlist + cooling-off, admin approval tiers, dual-control for large amounts, full audit of every approval and broadcast, and an **emergency "freeze withdrawals" global kill switch** (Redis flag + DB flag) that the signer checks before every broadcast.

---

## 10. Security Architecture

### 10.1 Network & infrastructure
- Three trust zones (§1.2) with security groups / firewall rules; signing zone has **no inbound** path from the internet or even the public API — it pulls work.
- Nginx terminates TLS 1.3, sets HSTS, security headers, request size limits, and front-line rate limiting. Optional WAF/CDN (Cloudflare) in front for DDoS and bot mitigation.
- Admin surfaces reachable only via VPN / IP allowlist + mTLS where feasible.
- Secrets in a manager (AWS Secrets Manager / Vault), never in the repo or plain `.env` in prod. Key material backed by **KMS/HSM**.

### 10.2 Application security
- **OWASP Top 10** discipline: parameterized queries only (Prisma), output encoding, no string-built SQL.
- **Input validation** on every endpoint (zod); reject unknown fields.
- **Authn/Authz** separated; every admin/privileged route re-checks RBAC server-side (never trust client role claims).
- **Rate limiting & lockouts** on auth (login, OTP, password reset) with progressive backoff and IP+account dimensions.
- **2FA (TOTP)** mandatory for withdrawals and admin accounts.
- **Step-up auth** + **withdrawal address allowlist + cooling-off** + **email/push notification on every sensitive action** (so account takeover is visible to the user).
- **CSRF**: APIs are token-auth (Bearer), not cookie-session, which sidesteps classic CSRF; if any cookie auth is used (admin SPA), apply SameSite + CSRF tokens.
- **Secrets/PII encryption at rest**: KYC docs encrypted (KMS), DB encryption at rest, column-level encryption for the most sensitive PII (PAN, Aadhaar references).

### 10.3 Key management (the core of a CEX)
- Hot-wallet keys: generated and used only inside the signer; encrypted at rest with KMS; decrypted only into signer memory; access logged.
- Cold storage: offline / hardware / multisig; movement requires multiple humans (dual control).
- Seed backup: split (Shamir) and stored in separate physical custody.
- Rotate-ability planned (ability to migrate to new wallets).

### 10.4 Operational security
- Least-privilege IAM; separate prod/staging accounts.
- Audit log of all admin actions and all infra access (§14/§15).
- Anomaly alerting: large/odd withdrawals, hot-wallet drain rate, failed-login spikes, scanner stalls, ledger invariant violations.
- Incident runbook + the **global withdrawal freeze** kill switch.
- Dependency scanning (npm audit / Snyk), container image scanning, secret scanning in CI, periodic third-party pentest before launch.

---

## 11. Authentication Architecture

### 11.1 Registration & login
- Email/phone + password (Argon2id hashing). Email/phone verification (OTP) before KYC.
- Optionally OTP-first (phone) given Indian market, but always with a password or device-bound credential to avoid SIM-swap-only auth for fund access.

### 11.2 Tokens
- **Access token**: JWT, short TTL (10–15 min), signed with **RS256** (private key in backend, public key verifiable), claims = `sub`, `sessionId`, `kycTier`, `scopes`. *No* sensitive PII in the JWT.
- **Refresh token**: opaque, random, **stored hashed** in DB with device metadata; **rotating** (each use issues a new one and invalidates the old — reuse detection = token theft → revoke session family).
- **Session registry in Redis + DB**: enables instant revocation (logout-all, admin force-logout, password change invalidates all sessions). This is why we don't rely on stateless JWT alone — a custodial app needs the ability to *kill* a session now.

### 11.3 2FA & step-up
- **TOTP** (RFC 6238) enrollment with recovery codes. Mandatory for withdrawals and admin.
- **Step-up** for: withdrawals, changing 2FA, adding withdrawal addresses, changing email/phone. Step-up requires fresh TOTP and re-auth within a short window.

### 11.4 Admin auth
- Separate admin identity store / role table, mandatory 2FA, IP allowlist, shorter session TTL, and **all actions audited**. Consider hardware keys (WebAuthn) for admins.

### 11.5 Device & anti-fraud
- Device fingerprint + new-device email/push alerts.
- Suspicious-login challenge (re-verify).
- Account states: `ACTIVE / FROZEN / LOCKED / CLOSED` gate all sensitive actions.

---

## 12. Admin Architecture

### 12.1 Separation
Admin API is a **separate deployment + hostname + network boundary** (VPN/IP allowlist), same codebase but distinct entrypoint, its own RBAC, and its own audit. Admins never use the public API.

### 12.2 RBAC roles (example)
| Role | Capabilities |
|------|-------------|
| `support` | Read users/tx, respond to tickets, no money actions |
| `kyc_officer` | Approve/reject KYC, view documents |
| `finance` | View ledgers, reconcile, view revenue |
| `withdrawal_approver` | Approve crypto/INR withdrawals (within limits) |
| `compliance` | Audit logs, AML cases, freeze accounts, file reports |
| `superadmin` | Role management, config, kill switch (dual-control) |

Permissions are **fine-grained and checked server-side**; roles compose permissions. Dangerous actions (large-withdrawal approval, config changes, fund movement) require **dual control** (two distinct admins).

### 12.3 Admin capabilities mapped to requirements
- **Dashboard statistics** — users, KYC funnel, deposit/withdrawal volume, hot-wallet balance, pending queues, revenue (from fee accounts).
- **User management** — search, view, freeze/unfreeze, force-logout, reset 2FA (with verification), view ledger.
- **KYC management** — queue, document viewer (audited, watermarked, time-limited signed URLs), approve/reject with reason.
- **Deposit management** — view detected/credited deposits, handle mismatches (wrong-chain credits), manual review.
- **Withdrawal management** — approval queue, risk flags, approve/reject, view on-chain status, freeze.
- **Transaction monitoring** — unified ledger/transaction explorer with filters; flag suspicious patterns.
- **Audit logs** — immutable, searchable (§15).
- **Revenue monitoring** — read from fee/spread internal accounts; per-asset, per-period.

### 12.4 Admin safety
Every admin write produces an audit record (who, what, before/after, IP, time). KYC document access is itself audited. No admin can edit a ledger entry — only post compensating entries via a controlled, dual-approved adjustment workflow.

---

## 13. Scalability Recommendations

### 13.1 Now (single region, vertical-first)
- One primary Postgres (well-indexed) + **one read replica** for admin/reporting/heavy reads.
- Stateless API behind Nginx → scale by adding API containers horizontally.
- Redis for cache/locks/queues.
- Scanners and workers scale per chain independently.

### 13.2 Scaling levers as you grow (in order)
1. **Read replicas** for reporting and the admin transaction explorer; keep all writes on primary.
2. **Connection pooling** (PgBouncer) — Node + Prisma will exhaust Postgres connections otherwise.
3. **Caching** hot reads in Redis (prices, KYC status, user profile) with explicit invalidation.
4. **Queue partitioning** — separate BullMQ queues per concern (deposits, withdrawals, notifications) with independent concurrency so a backlog in one doesn't starve another.
5. **Table partitioning** — partition high-volume append tables (`ledger_entries`, `audit_logs`, `deposits`) by time range; archive old partitions.
6. **Extract services** at real seams (notifications, KYC, per-chain wallet) when a component's scaling or deploy cadence diverges.
7. **Multi-region / DR** — async replica in another region, documented failover, regular restore drills.

### 13.3 What *not* to do early
Don't shard Postgres, don't go event-sourced-microservices, don't introduce Kafka. The ledger benefits from single-writer strong consistency far more than from premature distribution. Scale the boring way until metrics force otherwise.

### 13.4 Performance guardrails
- Every list endpoint paginated and index-backed.
- N+1 queries banned (Prisma `include`/`select` discipline; query review in CI).
- Idempotency + locks scoped narrowly to avoid lock contention on hot rows (e.g. lock per-user, not global).

---

## 14. Logging Strategy

### 14.1 Three distinct log streams (do not conflate)
1. **Application logs** — structured JSON (pino), levels, correlation/request id, no secrets/PII. Shipped to a log store (Loki/ELK/CloudWatch). Operational debugging.
2. **Audit logs** — business/security events, **append-only, in Postgres** (durable, queryable, retained per compliance). Not the same as app logs. (§15.)
3. **Access logs** — Nginx + auth events (logins, token refresh, admin access).

### 14.2 Principles
- **Structured, correlated**: every request gets a `requestId`; it flows through logs, jobs, and webhook processing so one user action is traceable end to end.
- **Never log**: passwords, tokens, private keys, full PAN/Aadhaar, OTPs, raw KYC data. Redaction middleware on the logger.
- **Levels with intent**: `error` pages someone; `warn` is reviewed; `info` is business milestones; `debug` off in prod.
- **Tamper-evidence** for security-relevant logs (ship off-host quickly; audit table append-only).
- **Retention**: app logs 30–90 days; audit/compliance logs **5+ years** (PMLA expectation, see §16).

### 14.3 Metrics & tracing
- Metrics (Prometheus): request latency/error rates, queue depths, scanner lag, hot-wallet balance, withdrawal approval latency, ledger invariant check results.
- Alerting (Alertmanager/PagerDuty) on the money-critical signals listed in §10.4.
- Optional distributed tracing (OpenTelemetry) once services split.

---

## 15. Audit Trail Design

### 15.1 What it is
An **append-only `audit_logs` table** capturing every security- and money-significant event with enough context to reconstruct *who did what, when, from where, and what changed*. This is a compliance artifact, not a debugging convenience.

### 15.2 Schema shape (see §17 for DDL)
```
audit_logs(
  id, occurred_at,
  actor_type      -- USER | ADMIN | SYSTEM
  actor_id,
  action          -- e.g. WITHDRAWAL_APPROVED, KYC_REJECTED, LOGIN, ADDRESS_ADDED
  entity_type,
  entity_id,
  before_state    -- jsonb snapshot (sensitive fields redacted/hashed)
  after_state     -- jsonb
  ip, user_agent, request_id,
  metadata        -- jsonb
)
```

### 15.3 Rules
- **Append-only**: no `UPDATE`/`DELETE`. Enforced by DB role permissions (the app role can `INSERT` and `SELECT` only) and ideally a trigger that blocks mutations.
- **Written in the same transaction** as the action it records where correctness demands it (e.g. admin approving a withdrawal), so you can't have the action without the audit.
- **Tamper-evidence**: optionally hash-chain rows (each row stores hash of previous + its own content) so silent deletion/edit is detectable.
- **Covers at minimum**: auth events, KYC decisions, every ledger-affecting action, withdrawal approvals/broadcasts, admin config/role changes, account freezes, KYC document access, and use of the kill switch.

### 15.4 Distinction from the ledger
The **ledger** is the financial truth (balances). The **audit log** is the action/decision truth (who triggered it). Both append-only; together they answer "the number changed — who caused it and were they allowed to?"

---

## 16. Compliance Considerations (India-specific)

> Treat this section as requiring legal/CA sign-off. The architecture must *support* these; the obligations themselves are legal.

### 16.1 Regulatory registration
- **FIU-IND registration as a Reporting Entity** is required for VDA service providers in India (under PMLA, post-March 2023 notification). The system must support the reporting obligations that come with it (CTRs/STRs, recordkeeping).
- **PMLA recordkeeping**: identity records and transaction records retained (commonly cited as **5 years**) and producible to authorities.

### 16.2 KYC / AML
- **Mandatory KYC** before fiat or trading: PAN (income-tax linkage is effectively required), proof of identity/address, liveness/selfie match. Aadhaar-based eKYC where permitted, handled with strict consent and data-minimization.
- **AML/CFT**: sanctions/PEP screening at onboarding and ongoing; blockchain-analytics screening of deposit/withdrawal addresses (e.g. against known illicit clusters); **STR/CTR filing** workflow for compliance officers; risk-tiering of users with **tier-based limits**.
- **Travel Rule** awareness for VASP-to-VASP transfers.

### 16.3 Taxation (this shapes product + ledger)
- **§194S — 1% TDS** on transfer of VDAs: the exchange must **deduct 1% TDS** on applicable transactions, remit it, and issue records. Your conversion/withdrawal flows and ledger must compute, withhold (a TDS internal account), and report this. *This is a design requirement, not optional.*
- **30% tax on VDA gains (§115BBH)** + no loss set-off: you must give users transaction history/statements sufficient for their filing; you generally don't compute their gains tax, but your records enable it.
- **GST** may apply to your service fees — fee accounting must be GST-aware.
- **1% TDS specifically** means INR↔USDT conversions and crypto withdrawals need a withholding step and downstream reporting exports.

### 16.4 Banking rails reality (architecture impact)
- Indian banks/UPI have an inconsistent, sometimes hostile stance toward crypto-linked flows. **Do not hard-couple to one payment gateway.** Abstract the payments provider behind an interface so you can switch/multiplex providers (and handle a provider dropping you) without touching ledger code. Expect deposit/withdrawal rails to be your most operationally fragile dependency.
- Maintain clean **nodal/escrow-style settlement accounting** between gateway settlements and user ledger credits (clearing accounts in the ledger).

### 16.5 Data protection
- **DPDP Act 2023** obligations for personal data: consent, purpose limitation, security safeguards, breach notification, data-principal rights. KYC PII encrypted, access-controlled, and audited; data retention balanced against PMLA's retention mandate.

### 16.6 Other
- Grievance redressal mechanism, terms/risk disclosures, and clear segregation of customer assets from company funds (the cold/hot reserve and internal accounts must make "customer liabilities vs company assets" auditable at any moment — a proof-of-reserves-friendly ledger).

---

## 17. Complete PostgreSQL Schema Design

> Expressed as annotated SQL DDL. In implementation this is authored as Prisma models; the SQL is the canonical intent. `NUMERIC` everywhere for money. UUID PKs. `created_at/updated_at` on mutable tables. Append-only tables noted.

```sql
-- ============ ENUMS ============
CREATE TYPE user_status      AS ENUM ('ACTIVE','FROZEN','LOCKED','CLOSED');
CREATE TYPE kyc_status       AS ENUM ('NOT_STARTED','PENDING','APPROVED','REJECTED');
CREATE TYPE kyc_doc_type     AS ENUM ('PAN','AADHAAR','PASSPORT','SELFIE','ADDRESS_PROOF');
CREATE TYPE chain            AS ENUM ('TRON','ETHEREUM','BSC');
CREATE TYPE asset_symbol     AS ENUM ('INR','USDT');
CREATE TYPE account_kind     AS ENUM ('USER_AVAILABLE','USER_LOCKED','FEE_REVENUE',
                                      'TDS_PAYABLE','HOT_WALLET','COLD_WALLET',
                                      'GATEWAY_CLEARING','SWEEP_CLEARING','SYSTEM');
CREATE TYPE entry_direction  AS ENUM ('DEBIT','CREDIT');
CREATE TYPE deposit_status   AS ENUM ('DETECTED','CONFIRMING','CONFIRMED','CREDITED','ORPHANED');
CREATE TYPE withdrawal_status AS ENUM ('REQUESTED','RISK_CHECK','PENDING_APPROVAL','APPROVED',
                                       'QUEUED','SIGNING','BROADCAST','CONFIRMING','COMPLETED',
                                       'REJECTED','FAILED','CANCELLED');
CREATE TYPE inr_txn_status   AS ENUM ('INITIATED','PENDING','SUCCESS','FAILED','REVERSED');
CREATE TYPE inr_txn_type     AS ENUM ('DEPOSIT','WITHDRAWAL');
CREATE TYPE conversion_side  AS ENUM ('INR_TO_USDT','USDT_TO_INR');
CREATE TYPE actor_type       AS ENUM ('USER','ADMIN','SYSTEM');

-- ============ REFERENCE ============
CREATE TABLE assets (
  symbol        asset_symbol PRIMARY KEY,
  name          text NOT NULL,
  decimals      int  NOT NULL          -- INR=2, USDT=6
);

CREATE TABLE asset_chains (              -- which chains carry which asset
  asset         asset_symbol REFERENCES assets(symbol),
  chain         chain NOT NULL,
  contract_addr text,                    -- USDT contract per chain
  decimals      int NOT NULL,            -- on-chain decimals
  min_confirmations int NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  PRIMARY KEY (asset, chain)
);

-- ============ USERS / AUTH ============
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE,
  phone         text UNIQUE,
  password_hash text NOT NULL,           -- argon2id
  status        user_status NOT NULL DEFAULT 'ACTIVE',
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  kyc_status    kyc_status NOT NULL DEFAULT 'NOT_STARTED',
  kyc_tier      int NOT NULL DEFAULT 0,  -- 0..n => limits
  totp_secret_enc bytea,                 -- KMS-encrypted, null until enrolled
  totp_enabled  boolean NOT NULL DEFAULT false,
  referral_code text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TABLE auth_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  refresh_hash  text NOT NULL,           -- hashed rotating refresh token
  family_id     uuid NOT NULL,           -- token family for reuse detection
  device_info   jsonb,
  ip            inet,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON auth_sessions(user_id) WHERE revoked_at IS NULL;

CREATE TABLE totp_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  code_hash text NOT NULL,
  used_at timestamptz
);

CREATE TABLE login_attempts (            -- rate-limit / lockout / forensics
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  email citext, ip inet, success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ KYC ============
CREATE TABLE kyc_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid UNIQUE NOT NULL REFERENCES users(id),
  full_name     text,
  dob           date,
  pan_enc       bytea,                   -- encrypted
  aadhaar_ref_enc bytea,                 -- store reference, encrypted (data-minimization)
  address       jsonb,
  status        kyc_status NOT NULL DEFAULT 'PENDING',
  provider      text,
  provider_ref  text,
  rejected_reason text,
  reviewed_by   uuid,                    -- admin id
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kyc_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  doc_type      kyc_doc_type NOT NULL,
  storage_key   text NOT NULL,           -- object storage key (private bucket)
  sha256        text NOT NULL,           -- integrity
  status        kyc_status NOT NULL DEFAULT 'PENDING',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============ LEDGER (double-entry, append-only) ============
CREATE TABLE accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          account_kind NOT NULL,
  user_id       uuid REFERENCES users(id),   -- null for system accounts
  asset         asset_symbol NOT NULL REFERENCES assets(symbol),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset, kind)              -- one available/locked acct per user+asset
);
CREATE INDEX ON accounts(kind, asset);

CREATE TABLE ledger_transactions (         -- a balanced group of entries
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL,             -- DEPOSIT_CREDIT, WITHDRAWAL_HOLD, CONVERSION, FEE, TDS, ADJUSTMENT...
  reference_type text,                     -- e.g. 'deposit','withdrawal','conversion','inr_txn'
  reference_id  uuid,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ledger_transactions(reference_type, reference_id);

CREATE TABLE ledger_entries (              -- APPEND ONLY; sum(amount)=0 per txn
  id            bigserial PRIMARY KEY,
  txn_id        uuid NOT NULL REFERENCES ledger_transactions(id),
  account_id    uuid NOT NULL REFERENCES accounts(id),
  direction     entry_direction NOT NULL,
  amount        numeric(38,18) NOT NULL CHECK (amount > 0), -- magnitude; sign via direction
  asset         asset_symbol NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ledger_entries(account_id);
CREATE INDEX ON ledger_entries(txn_id);
-- Invariant (checked by job + ideally a constraint trigger):
--   for each txn_id: SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END)=0

CREATE TABLE account_balances (            -- projection, updated in same txn as entries
  account_id    uuid PRIMARY KEY REFERENCES accounts(id),
  balance       numeric(38,18) NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============ WALLETS / DEPOSIT ADDRESSES ============
CREATE TABLE deposit_addresses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  chain         chain NOT NULL,
  address       text NOT NULL,
  derivation_index bigint NOT NULL,       -- internal counter, not user id
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain, address),
  UNIQUE (user_id, chain)                 -- one active deposit addr per user per chain
);
CREATE INDEX ON deposit_addresses(address);

-- ============ CRYPTO DEPOSITS ============
CREATE TABLE crypto_deposits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id),
  address_id    uuid REFERENCES deposit_addresses(id),
  chain         chain NOT NULL,
  asset         asset_symbol NOT NULL,
  tx_hash       text NOT NULL,
  log_index     int  NOT NULL DEFAULT 0,
  from_address  text,
  amount_base   numeric(78,0) NOT NULL,   -- integer base units (chain truth)
  amount        numeric(38,18) NOT NULL,  -- human amount
  confirmations int NOT NULL DEFAULT 0,
  status        deposit_status NOT NULL DEFAULT 'DETECTED',
  block_number  bigint,
  credited_txn_id uuid REFERENCES ledger_transactions(id),
  detected_at   timestamptz NOT NULL DEFAULT now(),
  credited_at   timestamptz,
  UNIQUE (chain, tx_hash, log_index)      -- idempotent crediting
);
CREATE INDEX ON crypto_deposits(status);
CREATE INDEX ON crypto_deposits(user_id);

CREATE TABLE chain_cursors (              -- scanner checkpoints
  chain         chain PRIMARY KEY,
  last_scanned_block bigint NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============ CRYPTO WITHDRAWALS ============
CREATE TABLE withdrawal_addresses (       -- user allowlist
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  chain chain NOT NULL,
  address text NOT NULL,
  label text,
  whitelisted_at timestamptz,             -- null until cooling-off passes
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, chain, address)
);

CREATE TABLE crypto_withdrawals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  chain         chain NOT NULL,
  asset         asset_symbol NOT NULL,
  to_address    text NOT NULL,
  amount        numeric(38,18) NOT NULL,  -- gross requested
  fee           numeric(38,18) NOT NULL DEFAULT 0,
  tds_amount    numeric(38,18) NOT NULL DEFAULT 0,
  net_amount    numeric(38,18) NOT NULL,  -- what actually leaves on-chain
  status        withdrawal_status NOT NULL DEFAULT 'REQUESTED',
  hold_txn_id   uuid REFERENCES ledger_transactions(id),
  final_txn_id  uuid REFERENCES ledger_transactions(id),
  tx_hash       text,
  nonce         bigint,                   -- EVM
  approved_by   uuid,
  approved_by_2 uuid,                     -- dual control
  approver_sig  text,                     -- HMAC the signer verifies
  risk_flags    jsonb,
  failure_reason text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  broadcast_at  timestamptz,
  completed_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON crypto_withdrawals(status);
CREATE INDEX ON crypto_withdrawals(user_id);

-- ============ INR (FIAT) ============
CREATE TABLE inr_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  type          inr_txn_type NOT NULL,
  amount        numeric(20,2) NOT NULL,
  fee           numeric(20,2) NOT NULL DEFAULT 0,
  status        inr_txn_status NOT NULL DEFAULT 'INITIATED',
  provider      text,                     -- razorpay/cashfree/etc (abstracted)
  provider_order_id text,
  provider_payment_id text,
  bank_ref      text,                     -- for withdrawals (payout)
  ledger_txn_id uuid REFERENCES ledger_transactions(id),
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_id)
);
CREATE INDEX ON inr_transactions(user_id, type);

CREATE TABLE payment_webhook_events (     -- raw, idempotent
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,
  provider_event_id text NOT NULL,
  event_type    text NOT NULL,
  signature_ok  boolean NOT NULL,
  payload       jsonb NOT NULL,
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE bank_accounts (              -- for INR withdrawals (payouts)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  account_number_enc bytea NOT NULL,
  ifsc text NOT NULL,
  holder_name text NOT NULL,
  verified_at timestamptz,               -- penny-drop verification
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ CONVERSION (INR <-> USDT) ============
CREATE TABLE price_quotes (               -- short-lived signed quotes
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  side          conversion_side NOT NULL,
  rate          numeric(20,8) NOT NULL,   -- INR per USDT incl. spread
  spread_bps    int NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  quote_id      uuid REFERENCES price_quotes(id),
  side          conversion_side NOT NULL,
  inr_amount    numeric(20,2) NOT NULL,
  usdt_amount   numeric(38,6) NOT NULL,
  rate          numeric(20,8) NOT NULL,
  fee_inr       numeric(20,2) NOT NULL DEFAULT 0,
  tds_amount    numeric(20,2) NOT NULL DEFAULT 0,   -- §194S 1%
  ledger_txn_id uuid REFERENCES ledger_transactions(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON conversions(user_id);

-- ============ LIMITS / CONFIG ============
CREATE TABLE tier_limits (
  kyc_tier int PRIMARY KEY,
  inr_daily_deposit numeric(20,2),
  inr_daily_withdrawal numeric(20,2),
  usdt_daily_withdrawal numeric(38,6)
);

CREATE TABLE system_flags (               -- kill switches, feature flags
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ ADMIN / RBAC ============
CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  totp_secret_enc bytea NOT NULL,
  totp_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL
);
CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL              -- e.g. 'withdrawal.approve'
);
CREATE TABLE role_permissions (
  role_id uuid REFERENCES roles(id),
  permission_id uuid REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE admin_roles (
  admin_id uuid REFERENCES admins(id),
  role_id uuid REFERENCES roles(id),
  PRIMARY KEY (admin_id, role_id)
);

-- ============ AUDIT (append-only) ============
CREATE TABLE audit_logs (
  id            bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_type    actor_type NOT NULL,
  actor_id      uuid,
  action        text NOT NULL,
  entity_type   text,
  entity_id     text,
  before_state  jsonb,
  after_state   jsonb,
  ip            inet,
  user_agent    text,
  request_id    text,
  prev_hash     text,                     -- optional hash-chaining
  row_hash      text,
  metadata      jsonb
);
CREATE INDEX ON audit_logs(actor_type, actor_id);
CREATE INDEX ON audit_logs(entity_type, entity_id);
CREATE INDEX ON audit_logs(action, occurred_at);

-- ============ IDEMPOTENCY ============
CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  key text NOT NULL,
  response_status int,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint, key)
);
```

**Schema notes for reviewers:**
- `ledger_entries` is the source of truth; `account_balances` is a derived cache kept consistent within the same transaction and verified by a periodic invariant job.
- USER funds always live in a `USER_AVAILABLE` account; withdrawal holds move them to `USER_LOCKED` (still the user's, just unspendable) — both are real accounts, so balances stay double-entry and explainable.
- TDS goes to a `TDS_PAYABLE` system account; fees to `FEE_REVENUE`. Revenue reporting = read those accounts.
- Wrong-chain deposits are representable (asset+chain explicit) and handled via admin tooling rather than silent credit.

---

## 18. Redis Usage Strategy

Redis is infrastructure glue, **never the source of truth for money**. Used for:

| Use | Pattern | Notes |
|-----|---------|-------|
| **Caching** | `user:{id}:profile`, `kyc:{id}:status`, prices | Short TTL + explicit invalidation on writes |
| **Live prices** | `price:USDTINR` updated by a price worker | Quotes computed from this + spread; persisted quote signed with TTL |
| **Sessions** | session registry mirror for fast revocation checks | Source of truth is DB; Redis for speed |
| **Rate limiting** | token-bucket / sliding window per IP+user+endpoint | Tight buckets on auth & withdrawals |
| **Distributed locks** | `lock:withdrawal:{userId}`, `lock:evm-nonce:{hotAddr}`, `lock:scanner:{chain}` | Redlock or single-instance `SET NX PX`; locks are advisory — DB row locks remain the real guard |
| **Job queue (BullMQ)** | deposits, withdrawals, confirmations, notifications, KYC polling | Separate queues, separate concurrency |
| **Idempotency hints / dedupe** | fast pre-check before DB unique constraint | DB constraint is the real guarantee |
| **Kill switch / flags** | `flag:withdrawals_frozen` | Mirrors `system_flags`; signer also checks DB |

**Discipline:** anything in Redis must be reconstructable from Postgres. Redis can be flushed and the system must recover (cold cache, re-warmed) without financial inconsistency. Persistence (AOF) enabled for the queue, but design tolerates loss.

---

## 19. Background Job Architecture

### 19.1 Engine
**BullMQ on Redis**, run as separate worker processes (`worker.ts`, `scanner.ts`) — independent of the API so they scale and fail independently.

### 19.2 Queues
| Queue | Trigger | Job |
|-------|---------|-----|
| `chain-scan:{tron,eth,bsc}` | repeatable/cron | scan blocks, upsert deposits |
| `deposit-confirm` | scheduled | advance confirmations, credit on threshold (idempotent) |
| `deposit-sweep` | scheduled | sweep per-user addresses to hot/warm (gas-aware) |
| `withdrawal-process` | on approval | hand approved intents to signer pickup / mark queued |
| `withdrawal-confirm` | scheduled | track broadcast tx confirmations, finalize/fail |
| `payment-webhook` | on webhook | process gateway events idempotently → INR credit |
| `payout-reconcile` | scheduled | reconcile INR payout status with provider |
| `kyc-poll` | on submit / scheduled | poll KYC provider for result |
| `notifications` | on domain events | push/email/SMS fan-out |
| `reconciliation` | nightly | ledger invariants, on-chain vs ledger, balance projection check |
| `compliance-reports` | scheduled | TDS export, STR/CTR data, statements |

### 19.3 Reliability requirements (all jobs)
- **Idempotent**: safe to run twice (unique constraints + status guards).
- **Retries with backoff**; **dead-letter** queue for poison jobs + alert.
- **Locks** so two workers don't process the same withdrawal/deposit.
- **Checkpointing** for scanners in Postgres.
- **Observability**: queue depth, processing latency, failure counts → metrics + alerts. A backed-up `withdrawal-confirm` or a stalled scanner pages on-call.
- **The signer pickup is a pull** from APPROVED rows, re-validated against the DB — it does not blindly trust a queue payload.

---

## 20. Development Roadmap

Phased to get to a *correct, compliant, custodial* MVP before breadth. Each phase ends with the system in a demonstrable, testable state.

### Phase 0 — Foundations (infra & guardrails)
- Repo, CI (lint, typecheck, tests, secret scan), Docker, Postgres + Redis, Prisma, config validation, structured logging, error envelope, base middleware. Staging environment. Trust-zone network skeleton.

### Phase 1 — Identity & Auth
- Registration, email/phone verification, login, JWT + rotating refresh + session registry, TOTP 2FA, account states, rate limiting/lockout, audit log foundation. Admin auth + RBAC skeleton.

### Phase 2 — Ledger core (do this before any money feature)
- Accounts, double-entry `ledger_transactions/entries`, balances projection, invariant checks, idempotency framework. Heavy unit/property tests (sum-to-zero, no-negative-available, concurrency). **Nothing else moves money until this is solid.**

### Phase 3 — KYC
- Document upload (encrypted object storage), KYC provider integration (or manual admin review), status state machine, tier limits, admin KYC queue + audited document viewer.

### Phase 4 — INR rails
- Payment gateway abstraction + first provider, deposit flow with signed idempotent webhooks → ledger credit, INR withdrawal (payout) with approval, bank account penny-drop verification, reconciliation job. TDS scaffolding.

### Phase 5 — Conversion (INR↔USDT)
- Price worker + Redis price, signed quotes with TTL, atomic two-leg conversion posting (fee + 1% TDS withholding), conversion history.

### Phase 6 — Wallet & deposit detection
- Signing-zone address derivation, deposit address issuance, per-chain scanners (TRON first — cheapest/most-used, then BSC, then ETH), confirmation tracking, idempotent crediting, reorg handling, sweep jobs, reconciliation.

### Phase 7 — Crypto withdrawals
- Withdrawal intent + holds, risk/limits, address allowlist + cooling-off, admin approval tiers + dual control, **isolated signer service**, per-chain signing/broadcast, nonce management, confirmation finalize, kill switch.

### Phase 8 — Admin panel (full)
- Dashboard stats, user management, deposit/withdrawal/transaction monitoring, revenue from internal accounts, full audit search, compliance exports.

### Phase 9 — Flutter app
- Auth, KYC capture, INR deposit/withdraw, convert, crypto deposit (QR addresses), withdraw with 2FA, history, push notifications. (Can run in parallel against API contracts from Phase 1 onward.)

### Phase 10 — Hardening & launch
- Third-party security pentest, key-management review, load testing, DR/restore drills, runbooks, monitoring/alerting completeness, compliance sign-off (FIU-IND registration, TDS reporting validated, legal review), proof-of-reserves-style reconciliation. **Cold/hot wallet split verified before holding real customer funds at scale.**

---

## Appendix A — Top risks the review team should pressure-test
1. **Key custody** — is the signer truly isolated? Can a public-API RCE move funds? (Should be *no*.)
2. **Double-credit / double-spend** — are all money paths idempotent and lock-guarded under concurrency?
3. **Wrong-chain deposits** — handled, not silently lost?
4. **Reorgs** — credit only after confirmations; rolling re-scan window?
5. **Payment-rail fragility** — provider abstraction real, or coupled to one gateway?
6. **TDS/§194S** — withheld and reported correctly at conversion and withdrawal?
7. **Ledger invariants** — automated, alerting, and reconciled against chain & gateway daily?
8. **Admin blast radius** — dual control on the dangerous actions; everything audited?

## Appendix B — Explicitly deferred (not in v1)
Order-book/spot trading engine, margin/derivatives, multiple fiat currencies, many assets beyond USDT, P2P, staking. The architecture leaves room (assets/chains are reference data; ledger is asset-agnostic) but these are out of scope for the described product.
```
