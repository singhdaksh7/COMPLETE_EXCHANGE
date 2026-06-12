# Product Requirements Document (PRD)
## INR ↔ USDT Centralized Crypto Exchange

**Companion to:** `ARCHITECTURE.md`
**Audience:** Solo freelance developer (build owner) + future engineering reviewers
**Scope:** TRC20 / ERC20 / BEP20 USDT, INR fiat rails, KYC, custodial wallets, admin, Flutter app
**Status:** v1 product definition (pre-implementation)

---

## How to read this document

This PRD turns the architecture into buildable, testable units of work. It is organized into **13 modules**, each self-contained with:

- **Business purpose** — why it exists / what value it delivers
- **User stories** — what an end user can do
- **Admin stories** — what an operator/admin can do
- **API requirements** — the endpoints that realize the stories
- **Database entities used** — tables from the architecture schema (Section 17 of `ARCHITECTURE.md`)
- **Acceptance criteria** — objective "done" conditions, including the money-correctness invariants
- **Estimates** — Complexity (Low/Medium/High), Development time (solo dev), Dependencies

After the modules: a consolidated estimate table and an **8-month solo milestone plan**.

> **Estimation basis:** times assume **one experienced full-stack developer working ~full-time (≈30 productive hours/week)**, building backend (Node/Express/Prisma) + Flutter, with no team. Ranges include testing, not legal/compliance lead time or third-party KYC/payment-provider onboarding (which are calendar dependencies, called out separately). Treat estimates as planning figures, not commitments.

> **Non-negotiable build order (from the architecture):** Foundations → Auth → **Ledger core** → everything that touches money. The Ledger (Module 3) is the spine; no money feature is "done" until it posts double-entry transactions through the Ledger.

---

## Module 0 — Platform Foundations (Infrastructure & Guardrails)

### Business purpose
The shared substrate every other module depends on: a deployable backend skeleton with the safety rails (config validation, structured logging, error envelope, idempotency framework, CI) that make a custodial financial system safe to iterate on. Cutting corners here is paid back tenfold later.

### User stories
- *(No direct end-user stories — this is infrastructure.)*

### Admin/operator stories
- As an operator, I can deploy the backend via Docker to staging and production with one documented command.
- As an operator, I can read structured, correlated logs (one `requestId` across an entire request) to debug an issue.
- As an operator, I can see health/readiness endpoints so Nginx and uptime monitors know if the service is up.
- As an operator, I can rely on CI rejecting code that fails lint, typecheck, tests, or secret scanning before it merges.

### API requirements
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| GET | `/ready` | Readiness (DB + Redis reachable) |
| GET | `/api/v1/version` | Build/version info |

Cross-cutting middleware delivered here (used by all later modules): request-id + logger binding, rate limiting (Redis), body limits, error handler → standard envelope, idempotency middleware skeleton, zod validation harness.

### Database entities used
- `system_flags`, `idempotency_keys` (framework tables)

### Acceptance criteria
- [ ] App boots only with a valid, schema-validated env (fails fast on missing/invalid config).
- [ ] Every response uses the standard success/error envelope with stable machine-readable error codes.
- [ ] Every log line is JSON, carries `requestId`, and contains no secrets/PII (redaction verified by test).
- [ ] `/ready` returns unhealthy if Postgres or Redis is down.
- [ ] CI runs lint + typecheck + tests + secret scan and blocks merge on failure.
- [ ] Idempotency middleware returns the original response for a replayed `Idempotency-Key`.
- [ ] Docker compose brings up API + Postgres + Redis locally; documented prod deploy on Ubuntu + Nginx.

### Estimates
- **Complexity:** Medium
- **Development time:** 1.5–2 weeks
- **Dependencies:** None (first thing built)

---

## Module 1 — Identity & Authentication

### Business purpose
Securely establish who a user is and maintain revocable sessions. In a custodial exchange, account takeover equals fund theft, so auth is a security-critical surface: 2FA, step-up, instant session revocation, and lockouts are requirements, not enhancements.

### User stories
- As a user, I can register with email/phone + password and verify via OTP.
- As a user, I can log in and receive a short-lived access token + a refresh token.
- As a user, I can stay logged in seamlessly (silent refresh) without re-entering my password every 15 minutes.
- As a user, I can enrol TOTP 2FA and download recovery codes.
- As a user, I must pass 2FA / step-up for sensitive actions (withdrawals, changing 2FA, adding withdrawal addresses, changing email/phone).
- As a user, I can see my active sessions/devices and log out of all of them.
- As a user, I am emailed/notified when a new device logs in.
- As a user, I am locked out / challenged after repeated failed login attempts.

### Admin stories
- As an admin, I can log in to the admin panel with mandatory 2FA and an IP allowlist.
- As an admin (with permission), I can force-logout a user's sessions.
- As an admin, I can freeze/unfreeze or lock a user account, gating all sensitive actions.
- As a compliance admin, I can see login history for a user.

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/auth/register` | Create account, send OTP |
| POST | `/api/v1/auth/verify-otp` | Verify email/phone |
| POST | `/api/v1/auth/login` | Returns access + refresh; may require 2FA challenge |
| POST | `/api/v1/auth/2fa/verify` | Complete TOTP step of login |
| POST | `/api/v1/auth/refresh` | Rotate refresh, issue access (reuse detection) |
| POST | `/api/v1/auth/logout` | Revoke current session |
| POST | `/api/v1/auth/logout-all` | Revoke session family/all |
| POST | `/api/v1/auth/2fa/enroll` · `/2fa/confirm` | TOTP setup + recovery codes |
| POST | `/api/v1/auth/step-up` | Re-auth for sensitive actions |
| POST | `/api/v1/auth/password/forgot` · `/reset` | Rate-limited recovery |
| GET | `/api/v1/auth/sessions` | List devices/sessions |
| POST | `/admin/v1/auth/login` · `/2fa/verify` | Admin auth (separate host) |

### Database entities used
- `users`, `auth_sessions`, `totp_recovery_codes`, `login_attempts`, `admins`, `roles`, `permissions`, `role_permissions`, `admin_roles`, `audit_logs`

### Acceptance criteria
- [ ] Passwords hashed with Argon2id; never logged or returned.
- [ ] Access token TTL ≤ 15 min (RS256); refresh tokens stored hashed, rotating, with reuse detection that revokes the whole family.
- [ ] Password change / `logout-all` invalidates all existing sessions immediately (verified via session registry).
- [ ] Sensitive actions are rejected without a valid step-up/2FA within the allowed window.
- [ ] Brute-force protection: progressive lockout on failed logins/OTP by account + IP.
- [ ] Admin login requires 2FA and respects IP allowlist; admin and user auth use separate stores/hosts.
- [ ] Every auth + admin-auth event is written to `audit_logs`.

### Estimates
- **Complexity:** High
- **Development time:** 2.5–3 weeks
- **Dependencies:** Module 0. (Email/SMS OTP provider onboarding — calendar dependency.)

---

## Module 2 — KYC Verification

### Business purpose
Legally required gate before fiat/trading for Indian users (PMLA / FIU-IND). Establishes verified identity, enables AML screening, and assigns KYC tiers that drive limits. Also a major PII-handling responsibility (DPDP Act).

### User stories
- As a user, I can submit KYC: personal details (name, DOB, address), PAN, and required documents/selfie.
- As a user, I can complete liveness/identity verification (via provider) or await manual review.
- As a user, I can see my KYC status: Not Started / Pending / Approved / Rejected, with a rejection reason.
- As a user, I can re-submit after a rejection.
- As a user, I cannot deposit INR, convert, or withdraw until KYC is Approved (enforced server-side).

### Admin stories
- As a KYC officer, I can see a queue of pending KYC submissions.
- As a KYC officer, I can view documents through a time-limited, audited, watermarked signed URL.
- As a KYC officer, I can approve or reject with a recorded reason.
- As a KYC officer, my document access and decisions are written to the audit log.
- As a compliance admin, I can set/adjust a user's KYC tier and the associated limits.

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/kyc/profile` | Submit personal details (PAN encrypted) |
| POST | `/api/v1/kyc/documents` | Upload doc (returns storage key; stored in private bucket) |
| POST | `/api/v1/kyc/submit` | Finalize submission → Pending |
| GET | `/api/v1/kyc/status` | Current status + reason |
| POST | `/api/v1/kyc/webhook` | Provider callback (signed) → status update |
| GET | `/admin/v1/kyc?status=PENDING` | Review queue |
| GET | `/admin/v1/kyc/{id}/documents/{docId}/url` | Signed, audited document URL |
| POST | `/admin/v1/kyc/{id}/approve` · `/reject` | Decision + reason |
| POST | `/admin/v1/users/{id}/kyc-tier` | Set tier/limits |

### Database entities used
- `kyc_profiles`, `kyc_documents`, `users` (kyc_status, kyc_tier), `tier_limits`, `audit_logs`, object storage (external)

### Acceptance criteria
- [ ] KYC documents stored in a private bucket, encrypted, with SHA-256 integrity recorded; never publicly accessible.
- [ ] PAN/Aadhaar references stored column-encrypted (KMS); not logged.
- [ ] Status state machine enforces valid transitions only (e.g. Approved cannot silently flip without an audited action).
- [ ] All money/trading endpoints check `kyc_status = APPROVED` server-side and reject otherwise.
- [ ] Every admin document view and every approve/reject is written to `audit_logs`.
- [ ] Provider webhook is signature-verified and idempotent.

### Estimates
- **Complexity:** Medium–High
- **Development time:** 2–3 weeks (3 if integrating a third-party KYC/liveness provider)
- **Dependencies:** Modules 0, 1; object storage; KYC provider account (calendar dependency); legal sign-off on data handling

---

## Module 3 — Ledger Core (Double-Entry Accounting) ⭐

### Business purpose
**The financial spine of the entire system.** Every balance is the sum of immutable, balanced ledger entries. This module makes balances explainable, mistakes detectable (invariants), and corrections auditable (reversing entries, never edits). Built before any feature that moves money.

### User stories
- As a user, I can view my current balances (INR available, USDT available, plus any locked amount).
- As a user, I can view my transaction history with running context (each entry traceable to its cause).
- *(End users never post entries directly — they trigger them via other modules.)*

### Admin stories
- As a finance admin, I can view any account's full entry history and current balance.
- As a finance admin, I can run/inspect the invariant checks (sum-to-zero per txn; projection == SUM(entries); no negative available balance).
- As a finance admin, I can post a controlled, dual-approved adjustment (compensating entries) — never an edit/delete of existing entries.

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/wallet/balances` | User balances (available + locked per asset) |
| GET | `/api/v1/wallet/transactions?cursor=` | Paginated ledger-derived history |
| GET | `/admin/v1/accounts/{id}/entries` | Full entry history |
| GET | `/admin/v1/ledger/invariants` | Invariant check results |
| POST | `/admin/v1/ledger/adjustment` | Dual-approved compensating posting |

*Note:* most ledger posting is an **internal service API** (`LedgerService.post(txn, entries)`), the only code allowed to change balances; other modules call it within their DB transaction.

### Database entities used
- `accounts`, `ledger_transactions`, `ledger_entries`, `account_balances`, `assets`, `audit_logs`

### Acceptance criteria
- [ ] Posting an unbalanced transaction (entries don't sum to zero) is rejected — enforced in code and verified by tests.
- [ ] `ledger_entries` is append-only: no code path updates or deletes an entry.
- [ ] `account_balances` projection is updated in the **same DB transaction** as the entries; a nightly job verifies `projection == SUM(entries)` for every account and alerts on drift.
- [ ] Concurrency: parallel postings against the same account never produce a negative available balance or a lost update (property/concurrency tests with row locks).
- [ ] A user's balance equals `SUM` of their entries at all times (no separate mutable balance source of truth).
- [ ] Corrections happen only via compensating entries; adjustment endpoint requires dual control and writes audit.

### Estimates
- **Complexity:** High
- **Development time:** 2.5–3 weeks (heavy on tests — this is where test investment is mandatory)
- **Dependencies:** Module 0. Blocks Modules 4, 5, 6, 7.

---

## Module 4 — INR Fiat Rails (Deposits & Withdrawals)

### Business purpose
Lets users fund their account in INR and cash out, via a payment gateway. The on-ramp/off-ramp that makes the exchange usable for Indian users — and operationally the most fragile dependency, so the provider must be abstracted.

### User stories
- As a user, I can initiate an INR deposit and pay through the gateway (UPI/netbanking/card).
- As a user, my INR balance is credited automatically once the gateway confirms payment.
- As a user, I can add and verify a bank account (penny-drop) for withdrawals.
- As a user, I can request an INR withdrawal to a verified bank account.
- As a user, I can see all my INR transactions and their statuses.

### Admin stories
- As a finance admin, I can view all INR deposits/withdrawals and their gateway references.
- As a finance admin, I can approve/reject INR withdrawals (payouts) within limits.
- As a finance admin, I can reconcile gateway settlements against ledger credits via a clearing account.
- As an operator, I can configure/switch the active payment provider without touching ledger logic.

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/inr/deposit/initiate` | Create order with provider |
| POST | `/api/v1/payments/webhook` | Signed, idempotent → credit INR |
| GET | `/api/v1/inr/transactions?cursor=` | History |
| POST | `/api/v1/inr/bank-accounts` | Add bank account |
| POST | `/api/v1/inr/bank-accounts/{id}/verify` | Penny-drop verify |
| POST | `/api/v1/inr/withdraw` | Request payout (step-up auth) |
| GET | `/admin/v1/inr/withdrawals?status=` | Payout queue |
| POST | `/admin/v1/inr/withdrawals/{id}/approve` · `/reject` | Decision |
| GET | `/admin/v1/inr/reconciliation` | Settlement vs ledger |

### Database entities used
- `inr_transactions`, `payment_webhook_events`, `bank_accounts`, `accounts` (GATEWAY_CLEARING, USER_AVAILABLE, FEE_REVENUE), `ledger_transactions/entries`, `audit_logs`, `tier_limits`

### Acceptance criteria
- [ ] Webhook signature verified; raw event persisted verbatim; processing idempotent on `(provider, provider_event_id)` — a replayed webhook never double-credits.
- [ ] Deposit credit is a double-entry posting (debit GATEWAY_CLEARING, credit USER_AVAILABLE) inside one DB transaction.
- [ ] INR withdrawal places a ledger hold before payout and finalizes/releases based on payout outcome.
- [ ] Withdrawals enforce KYC + tier daily limits + step-up auth.
- [ ] Payment provider is behind an interface; adding/switching a provider requires no ledger changes.
- [ ] Reconciliation job flags any mismatch between gateway settlement and ledger clearing account.

### Estimates
- **Complexity:** High
- **Development time:** 3–4 weeks
- **Dependencies:** Modules 0, 1, 2, 3; payment gateway + payout account approval (significant calendar/compliance dependency for crypto-linked businesses)

---

## Module 5 — INR ↔ USDT Conversion

### Business purpose
The core exchange action: convert INR to USDT and back at a quoted rate plus spread/fee, with 1% TDS withholding (§194S). This is where the business earns revenue (spread + fees) and meets a key tax obligation.

### User stories
- As a user, I can request a live quote to convert INR→USDT or USDT→INR (rate shown incl. spread, valid for a short window).
- As a user, I can execute a conversion against a quote and instantly see updated balances.
- As a user, I can see the fee and TDS applied on each conversion.
- As a user, I can view my conversion history.

### Admin stories
- As a finance admin, I can configure spread (bps) and fees.
- As a finance admin, I can view conversion volume and revenue (from FEE_REVENUE) and TDS withheld (from TDS_PAYABLE).
- As an operator, I can monitor the price feed worker and its freshness.

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/convert/quote` | Returns signed quote with TTL |
| POST | `/api/v1/convert/execute` | Execute against quote (idempotent) |
| GET | `/api/v1/convert/history?cursor=` | History |
| GET | `/admin/v1/convert/config` · PUT | Spread/fee config |
| GET | `/admin/v1/convert/revenue` | Spread/fee/TDS reporting |

### Database entities used
- `price_quotes`, `conversions`, `accounts` (USER_AVAILABLE INR/USDT, FEE_REVENUE, TDS_PAYABLE), `ledger_transactions/entries`, Redis (`price:USDTINR`), `audit_logs`

### Acceptance criteria
- [ ] A conversion is a single atomic multi-leg ledger posting (move INR out, USDT in, fee → FEE_REVENUE, TDS → TDS_PAYABLE), all-or-nothing.
- [ ] Quotes expire; executing an expired/forged quote is rejected.
- [ ] 1% TDS (§194S) computed and withheld to TDS_PAYABLE on applicable conversions; recorded for reporting.
- [ ] Rate used = live Redis price + configured spread; price staleness beyond a threshold blocks conversions.
- [ ] Rounding follows asset decimals (INR scale 2, USDT scale 6); no value created/destroyed (entries sum to zero).
- [ ] Idempotent execution: replay does not double-convert.

### Estimates
- **Complexity:** Medium–High
- **Development time:** 2–2.5 weeks
- **Dependencies:** Modules 0, 1, 2, 3; a price source (exchange API) for the price worker; CA confirmation of TDS handling

---

## Module 6 — Wallet & Crypto Deposit Detection

### Business purpose
Generates per-user deposit addresses on TRON/ETH/BSC and automatically credits USDT when on-chain deposits confirm — exactly once, reorg-safe. This is the crypto on-ramp and one of the two highest-risk modules.

### User stories
- As a user, I can generate/view my USDT deposit address (with QR) for each chain (TRC20/ERC20/BEP20).
- As a user, my USDT balance is credited automatically after my deposit reaches the required confirmations.
- As a user, I can see incoming deposits and their confirmation progress.
- As a user, if I send the wrong chain's USDT to an address, the case is recoverable via support (not silently lost).

### Admin stories
- As an operator, I can monitor scanner health and lag (head − cursor) per chain with alerts.
- As an admin, I can view detected/confirming/credited deposits and handle wrong-chain or stuck cases.
- As a finance admin, I can verify swept funds vs ledger via reconciliation.

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/wallet/address` | Issue/get deposit address for a chain |
| GET | `/api/v1/wallet/deposits?cursor=` | Crypto deposit history + confirmations |
| GET | `/admin/v1/deposits?status=` | Ops view |
| POST | `/admin/v1/deposits/{id}/resolve` | Handle mismatch/manual credit (audited) |
| GET | `/admin/v1/scanners/health` | Cursor lag per chain |

Background (no public API): chain scanners (`chain-scan:*`), `deposit-confirm`, `deposit-sweep`, reconciliation jobs.

### Database entities used
- `deposit_addresses`, `crypto_deposits`, `chain_cursors`, `asset_chains` (contract, min_confirmations), `accounts` (HOT_WALLET/SWEEP_CLEARING, USER_AVAILABLE), `ledger_transactions/entries`, `audit_logs`; signing-zone key derivation (external service)

### Acceptance criteria
- [ ] Deposit addresses derived from an HD wallet whose private keys never touch the app DB; index is an internal counter, not the user id.
- [ ] Detection and crediting are separate: a deposit is credited only after `confirmations ≥ asset_chains.min_confirmations`.
- [ ] Crediting is idempotent and transactional, guarded by `UNIQUE(chain, tx_hash, log_index)` + row lock — double scans/workers cannot double-credit.
- [ ] Reorg safety: scan to `head − SAFETY_LAG` with a rolling re-scan window; a reorged, not-yet-credited deposit flips to ORPHANED.
- [ ] `(chain, asset)` recorded explicitly; an ERC20-vs-BEP20 (same 0x address) mismatch is representable and routed to admin resolution, not silently credited.
- [ ] Scanners checkpoint cursor in Postgres and resume exactly after restart; dual RPC providers with failover; lag alerting.

### Estimates
- **Complexity:** High
- **Development time:** 4–5 weeks (TRON first, then BSC, then ETH; multi-chain testing is the time sink)
- **Dependencies:** Modules 0, 1, 2, 3; signing-zone key management; RPC providers (TronGrid, Infura/Alchemy, QuickNode/own node)

---

## Module 7 — Crypto Withdrawals (with Isolated Signer)

### Business purpose
Lets users send USDT off the platform, safely. The single most dangerous flow: it is designed so that even a full compromise of the public API cannot drain funds — signing happens only in an isolated trust zone, behind holds, limits, approvals, and a kill switch.

### User stories
- As a user, I can request a USDT withdrawal (chain, address, amount) with mandatory 2FA/step-up.
- As a user, I can manage a withdrawal address allowlist; new addresses have a cooling-off period before large withdrawals.
- As a user, my balance is held (not lost) while the withdrawal processes, and released if it fails.
- As a user, I can see withdrawal status and the on-chain tx hash once broadcast.
- As a user, I am notified at each state change.

### Admin stories
- As a withdrawal approver, I can see the approval queue with risk flags.
- As a withdrawal approver, I can approve/reject; large amounts require dual approval.
- As a superadmin, I can trigger a global withdrawal freeze (kill switch) that the signer checks before every broadcast.
- As an operator, I can monitor hot-wallet balance, payout caps, and stuck/failed withdrawals.

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/withdraw/crypto` | Create intent (step-up + 2FA) |
| GET | `/api/v1/withdraw/crypto?cursor=` | History/status |
| POST | `/api/v1/withdraw/addresses` | Add allowlisted address (cooling-off) |
| GET | `/api/v1/withdraw/addresses` | List allowlist |
| GET | `/admin/v1/withdrawals?status=` | Approval queue |
| POST | `/admin/v1/withdrawals/{id}/approve` · `/reject` | Decision (dual control over threshold) |
| POST | `/admin/v1/system/withdrawals-freeze` | Kill switch (dual control) |

Signer service (separate host, no inbound API): pulls APPROVED rows, re-validates against DB + approver signature, signs, broadcasts, writes back.

### Database entities used
- `crypto_withdrawals`, `withdrawal_addresses`, `accounts` (USER_AVAILABLE→USER_LOCKED→HOT_WALLET outflow, FEE_REVENUE, TDS_PAYABLE), `ledger_transactions/entries`, `system_flags` (freeze), `audit_logs`

### Acceptance criteria
- [ ] The public API cannot sign or broadcast; only the isolated signer (no inbound internet path) can move funds.
- [ ] Withdrawal places a ledger hold (available→locked) at request time; finalize debits on confirmation, failure releases the hold — balances always explainable.
- [ ] Signer re-reads the canonical intent from the DB and verifies status APPROVED + approver HMAC; it does not trust queue payloads.
- [ ] Limits enforced: per-user/tier daily caps, global per-interval payout cap inside the signer, hot-wallet balance ceiling.
- [ ] Address allowlist + cooling-off enforced; withdrawals require 2FA/step-up.
- [ ] Approval tiers: auto-approve under threshold; admin approval above; dual approval above a higher threshold.
- [ ] EVM nonce managed with single-flight lock; stuck-tx handling; TRON energy/bandwidth ensured.
- [ ] The freeze kill switch (DB + Redis) halts all broadcasts; checked by the signer before every send.
- [ ] 1% TDS withheld on applicable withdrawals.

### Estimates
- **Complexity:** High (highest-risk module in the system)
- **Development time:** 4–5 weeks
- **Dependencies:** Modules 0, 1, 2, 3, 6; signing-zone infrastructure + KMS/HSM; funded hot wallet for testing

---

## Module 8 — Admin Panel

### Business purpose
The operations and compliance cockpit: lets staff run the exchange — review KYC, approve withdrawals, monitor transactions, watch revenue, and read audit logs — under RBAC and dual control, on a network-isolated surface.

### User stories
- *(No end-user stories — admin-only surface.)*

### Admin stories
- As an admin, I see a dashboard: users, KYC funnel, deposit/withdrawal volume, hot-wallet balance, pending queues, revenue.
- As a support admin, I can search/view users and their ledgers (read-only).
- As a kyc/finance/withdrawal/compliance admin, I get exactly the capabilities my role grants (fine-grained, server-checked).
- As a compliance admin, I can search the immutable audit log by actor/action/entity/time.
- As a finance admin, I can view revenue (spread + fees) and TDS payable.
- As a superadmin, I manage roles/permissions and dangerous config under dual control.

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/v1/dashboard/stats` | Aggregate KPIs |
| GET | `/admin/v1/users?query=` · `/{id}` | Search / detail |
| POST | `/admin/v1/users/{id}/freeze` · `/unfreeze` | Account state |
| GET | `/admin/v1/transactions?filters` | Unified ledger/tx explorer |
| GET | `/admin/v1/audit?actor=&action=&entity=` | Audit search |
| GET | `/admin/v1/revenue?period=` | Revenue + TDS |
| CRUD | `/admin/v1/roles`, `/permissions` | RBAC management |

*(Reuses endpoints defined in Modules 2/4/6/7 for KYC/deposit/withdrawal management.)*

### Database entities used
- All read models; primarily `users`, `kyc_profiles`, `crypto_deposits`, `crypto_withdrawals`, `inr_transactions`, `conversions`, `accounts`/`ledger_entries` (revenue/TDS), `audit_logs`, `admins`/`roles`/`permissions`

### Acceptance criteria
- [ ] Admin API is a separate deployment/hostname reachable only via VPN/IP allowlist; admins never use the public API.
- [ ] Every permission is checked server-side; client-claimed roles are never trusted.
- [ ] Dangerous actions (large-withdrawal approval, config/role changes, fund movement, kill switch) require dual control.
- [ ] Every admin write produces an `audit_logs` record (who, what, before/after, IP, time).
- [ ] Dashboard figures are derived from the ledger/source tables (revenue from FEE_REVENUE, TDS from TDS_PAYABLE), not hand-maintained counters.
- [ ] No admin can edit/delete a ledger entry or audit row.

### Estimates
- **Complexity:** Medium–High (breadth, plus a frontend SPA)
- **Development time:** 4–5 weeks (backend endpoints + admin SPA UI)
- **Dependencies:** Modules 1–7 (consumes their data); RBAC from Module 1

---

## Module 9 — Notifications

### Business purpose
Keeps users informed and provides a security tripwire: notifying on logins and every sensitive action makes account takeover visible to the victim. Also delivers transactional updates (deposit credited, withdrawal status, KYC result).

### User stories
- As a user, I receive push/email/SMS for: new-device login, KYC result, INR/crypto deposit credited, conversion done, withdrawal state changes.
- As a user, I can manage notification preferences (where non-security-critical).

### Admin stories
- As an operator, I can monitor delivery success/failure and retry/dead-letter behaviour.
- As an admin, I can send a system/security broadcast (e.g. maintenance, withdrawal freeze notice).

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| GET/PUT | `/api/v1/notifications/preferences` | Manage prefs |
| GET | `/api/v1/notifications?cursor=` | In-app inbox |
| POST | `/admin/v1/notifications/broadcast` | System message |

Primarily event-driven: domain events → `notifications` queue → provider fan-out.

### Database entities used
- A `notifications` table (in-app), `users`; consumes domain events from all modules; providers external (FCM, email, SMS)

### Acceptance criteria
- [ ] Security-critical notifications (new-device login, withdrawal requested/broadcast, 2FA/address changes) are always sent and cannot be disabled.
- [ ] Delivery is via the `notifications` queue with retries + dead-letter; a provider outage doesn't block the originating transaction.
- [ ] No sensitive data (OTP reuse, full PAN, keys) in notification bodies.

### Estimates
- **Complexity:** Low–Medium
- **Development time:** 1.5–2 weeks
- **Dependencies:** Module 0 (queues), Module 1; FCM/email/SMS provider accounts

---

## Module 10 — Audit & Compliance

### Business purpose
Satisfies legal/regulatory obligations (FIU-IND/PMLA recordkeeping, §194S TDS reporting, DPDP) and provides tamper-evident proof of who did what. The audit log + compliance exports are the system's accountability layer.

### User stories
- As a user, I can download statements/transaction reports sufficient for my tax filing (VDA history, TDS deducted).

### Admin stories
- As a compliance admin, I can search the append-only audit trail and export it.
- As a compliance admin, I can generate TDS reports (withheld amounts, per period) for remittance/filing.
- As a compliance admin, I can produce STR/CTR-supporting data and AML screening results.
- As a compliance admin, I can rely on PMLA-grade retention (5+ years) of identity and transaction records.

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/reports/statement?period=` | User statement (incl. TDS) |
| GET | `/admin/v1/audit/export?filters` | Audit export |
| GET | `/admin/v1/compliance/tds?period=` | TDS report |
| GET | `/admin/v1/compliance/aml/cases` | AML/STR workflow |

Background: `compliance-reports`, `reconciliation` jobs.

### Database entities used
- `audit_logs` (append-only, optional hash-chain), `conversions`/`crypto_withdrawals` (TDS), `kyc_profiles`, AML case tables, `ledger_*` (statements)

### Acceptance criteria
- [ ] `audit_logs` is append-only enforced at the DB role level (app role can INSERT/SELECT only); optional hash-chaining detects tampering.
- [ ] Identity + transaction records retained ≥ 5 years; retention policy reconciled against DPDP minimization.
- [ ] TDS report reconciles exactly with the TDS_PAYABLE ledger account for any period.
- [ ] AML screening results recorded; STR/CTR data exportable for compliance officers.
- [ ] User statements reconcile with the user's ledger entries.

### Estimates
- **Complexity:** Medium
- **Development time:** 2–3 weeks (plus ongoing legal/CA collaboration)
- **Dependencies:** Modules 3, 5, 7 (data sources); AML screening provider; CA/legal guidance (calendar dependency)

---

## Module 11 — Background Jobs & Reconciliation

### Business purpose
The asynchronous engine behind detection, confirmation, sweeps, payouts, notifications, and the nightly integrity checks that keep the ledger honest against the chain and the gateway. Cross-cutting reliability layer for several modules.

### User stories
- *(Indirect — users experience this as "deposits credit automatically" and "balances are always correct.")*

### Admin stories
- As an operator, I can see queue depths, processing latency, failures, and dead-letter counts per queue.
- As an operator, I am paged when a scanner stalls, a confirmation queue backs up, or a ledger invariant fails.
- As a finance admin, I can review nightly reconciliation results (ledger vs chain vs gateway).

### API requirements
| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/v1/jobs/queues` | Queue stats |
| GET | `/admin/v1/jobs/dead-letter` | Poison jobs |
| POST | `/admin/v1/jobs/{id}/retry` | Manual retry |
| GET | `/admin/v1/reconciliation/latest` | Nightly results |

Mostly internal (BullMQ workers): `chain-scan:*`, `deposit-confirm`, `deposit-sweep`, `withdrawal-confirm`, `payment-webhook`, `payout-reconcile`, `kyc-poll`, `notifications`, `reconciliation`, `compliance-reports`.

### Database entities used
- `chain_cursors`, `crypto_deposits`, `crypto_withdrawals`, `inr_transactions`, `payment_webhook_events`, `account_balances`/`ledger_entries` (invariants), Redis (BullMQ)

### Acceptance criteria
- [ ] Every job is idempotent (safe to run twice) and uses locks so two workers don't process the same item.
- [ ] Retries with backoff; poison jobs dead-letter and alert.
- [ ] Scanners checkpoint in Postgres; restart resumes exactly.
- [ ] Nightly reconciliation verifies ledger invariants, balance projection, and chain/gateway agreement, alerting on any drift.
- [ ] Queue metrics and lag alerts are wired to monitoring.

### Estimates
- **Complexity:** Medium–High
- **Development time:** 2–3 weeks (much overlaps with Modules 4/6/7; budget as incremental)
- **Dependencies:** Modules 0, 3, 4, 6, 7

---

## Module 12 — Flutter Mobile Application

### Business purpose
The primary end-user product. Delivers the full user journey (register → KYC → deposit → convert → withdraw → history) in a polished, secure mobile app consuming the backend API contract.

### User stories
- As a user, I can do everything the user stories above describe from the app: register/login with 2FA, complete KYC (camera capture), deposit INR, convert, view a crypto deposit QR, withdraw with 2FA, and browse history with push notifications.
- As a user, my session refreshes silently and I'm prompted for step-up on sensitive actions.

### Admin stories
- *(Admin uses the separate web SPA, not the Flutter app.)*

### API requirements
- Consumes all `/api/v1/*` endpoints via a generated client from the OpenAPI spec; Dio with auth-refresh interceptor and standard error-envelope handling.

### Database entities used
- None directly (client). Local secure storage for tokens (flutter_secure_storage).

### Acceptance criteria
- [ ] Tokens stored in secure storage; access token auto-refreshes; logout clears all local auth state.
- [ ] All money-moving actions require 2FA/step-up and show fees + TDS before confirmation.
- [ ] Error states map to backend `error.code` (no raw stack/prose to user).
- [ ] KYC document/selfie capture works on iOS + Android; deposit addresses render as scannable QR with chain clearly labelled.
- [ ] Handles network failures gracefully; never shows a stale balance as authoritative after a money action (re-fetches).

### Estimates
- **Complexity:** High (breadth of flows + secure mobile concerns)
- **Development time:** 6–8 weeks (can run partly in parallel against API contracts)
- **Dependencies:** Stable API contracts from Modules 1–7; design assets

---

## Consolidated Estimate Summary

| # | Module | Complexity | Dev time (solo) | Key dependencies |
|---|--------|-----------|-----------------|------------------|
| 0 | Platform Foundations | Medium | 1.5–2 wk | — |
| 1 | Identity & Auth | High | 2.5–3 wk | 0 |
| 2 | KYC | Medium–High | 2–3 wk | 0,1 + KYC provider |
| 3 | **Ledger Core** ⭐ | High | 2.5–3 wk | 0 |
| 4 | INR Fiat Rails | High | 3–4 wk | 0,1,2,3 + gateway |
| 5 | Conversion | Medium–High | 2–2.5 wk | 0,1,2,3 + price feed |
| 6 | Wallet & Deposit Detection | High | 4–5 wk | 0,1,2,3 + RPC/keys |
| 7 | Crypto Withdrawals + Signer | High | 4–5 wk | 0,1,2,3,6 + signer/KMS |
| 8 | Admin Panel | Medium–High | 4–5 wk | 1–7 |
| 9 | Notifications | Low–Medium | 1.5–2 wk | 0,1 + providers |
| 10 | Audit & Compliance | Medium | 2–3 wk | 3,5,7 + legal/CA |
| 11 | Background Jobs & Reconciliation | Medium–High | 2–3 wk (mostly overlapping) | 0,3,4,6,7 |
| 12 | Flutter App | High | 6–8 wk (parallelizable) | 1–7 |

**Raw sum:** ≈ 38–48 developer-weeks. With overlap (jobs fold into 4/6/7; Flutter and Admin partly parallel; compliance ongoing), the realistic **single-developer calendar is ~7–9 months** to a hardened, launch-ready v1 — **excluding** legal/FIU-IND registration, KYC/payment-provider onboarding, and a third-party security audit, which run on their own calendars.

---

## Milestone Plan — Solo Freelance Developer (≈8 months)

Sequenced so each milestone ends in a demonstrable, testable state and respects the hard build order (Ledger before money). Calendar dependencies (provider/legal onboarding) are started early so they're ready when code needs them.

### Milestone 0 — Setup & Foundations *(Weeks 1–2)*
- Module 0 complete: Docker, Postgres/Prisma, Redis, config validation, logging, error envelope, idempotency, CI, staging deploy.
- **Start in parallel (calendar):** apply for KYC provider, payment gateway, and begin FIU-IND/legal + CA conversations.
- **Exit:** deployable skeleton with health checks and CI green.

### Milestone 1 — Identity & Auth *(Weeks 3–5)*
- Module 1: registration, OTP, login, JWT + rotating refresh + session registry, TOTP 2FA, step-up, lockouts, admin auth + RBAC skeleton, audit foundation.
- **Exit:** a user can register, verify, log in with 2FA; sessions revocable; admin can log in.

### Milestone 2 — Ledger Core *(Weeks 6–8)* ⭐
- Module 3: accounts, double-entry transactions/entries, balances projection, invariants, heavy concurrency/property tests.
- **Exit:** balances are provably the sum of immutable entries; invariants automated; nothing can post an unbalanced txn. *This is the milestone not to rush.*

### Milestone 3 — KYC *(Weeks 9–11)*
- Module 2: encrypted document upload, provider integration (or manual review), status machine, tier limits, admin KYC queue + audited viewer.
- **Exit:** a user can complete KYC; an officer can approve/reject; money endpoints gated on Approved.

### Milestone 4 — INR Rails + Conversion *(Weeks 12–16)*
- Module 4: gateway abstraction + first provider, idempotent webhook deposits, bank verification, INR withdrawal with holds + approval, reconciliation.
- Module 5: price worker, signed quotes, atomic conversion with fee + 1% TDS.
- Fold in relevant Module 11 jobs (payment-webhook, payout-reconcile).
- **Exit:** end-to-end fiat: deposit INR → convert to USDT → convert back → withdraw INR, all double-entry and reconciled.

### Milestone 5 — Crypto Deposits *(Weeks 17–21)*
- Module 6: HD address issuance (signing-zone derivation), TRON scanner first → BSC → ETH, confirmation tracking, idempotent credit, reorg handling, sweeps, reconciliation.
- **Exit:** real USDT sent on each chain credits the right user exactly once, reorg-safe; scanner health monitored.

### Milestone 6 — Crypto Withdrawals + Signer *(Weeks 22–26)*
- Module 7: isolated signer service, intent + holds, risk/limits, address allowlist + cooling-off, approval tiers + dual control, nonce/energy handling, kill switch, TDS.
- **Exit:** a user can withdraw USDT on each chain through the isolated signer; API compromise cannot move funds; freeze switch works.

### Milestone 7 — Admin Panel + Notifications *(Weeks 27–30)*
- Module 8: admin SPA + endpoints (dashboard, users, tx explorer, audit search, revenue), all dual-control + audited.
- Module 9: notifications across all events; security notifications mandatory.
- **Exit:** ops can run the exchange entirely from the admin surface; users are notified of everything important.

### Milestone 8 — Flutter App *(Weeks 27–34, overlapping)*
- Module 12: full user app against the finalized API contract. Start UI scaffolding earlier (after Milestone 1 contracts) and fill flows as each backend module lands.
- **Exit:** end-to-end user journey works on iOS + Android.

### Milestone 9 — Compliance, Hardening & Launch *(Weeks 33–36)*
- Module 10 finalized: audit append-only enforcement, TDS reports reconciling to ledger, statements, retention.
- Hardening: third-party security pentest, key-management review, load test, DR/restore drill, runbooks, full monitoring/alerting, cold/hot split verified.
- Compliance sign-off: FIU-IND registration confirmed, TDS remittance validated, legal review of terms/risk disclosures.
- **Exit:** launch-ready v1 holding real customer funds with verified controls.

### Solo-developer guidance baked into this plan
- **Front-load calendar dependencies** (KYC/payment/legal) in Milestone 0 — they take weeks of external lead time and will otherwise stall you.
- **Never skip Milestone 2's tests** — every later money bug is cheaper to prevent here.
- **One chain at a time** (TRON → BSC → ETH) in Milestones 5–6; don't parallelize multi-chain while solo.
- **Use a third-party KYC/liveness provider** rather than building it — buy, don't build, anything off the critical-differentiation path.
- **Get the §194S TDS and FIU-IND items reviewed by a CA/lawyer before launch**, not after — they shape the ledger and are hard to retrofit.
- **Do not hold material customer funds until Milestone 9's pentest + cold/hot split are verified.**

---

## Appendix — Build order dependency graph (text)

```
M0 Foundations
 ├─► M1 Auth ──┬─► M2 KYC ──┐
 │             │            │
 └─► M3 Ledger ┴────────────┼─► M4 INR Rails ──┐
                            ├─► M5 Conversion ──┤
                            └─► M6 Crypto Deposits ─► M7 Crypto Withdrawals
                                                          │
 M8 Admin  ◄── consumes M1..M7 ◄──────────────────────────┘
 M9 Notifications ◄── events from M1..M7
 M10 Compliance  ◄── M3,M5,M7
 M11 Jobs        ◄── woven through M4,M6,M7
 M12 Flutter     ◄── API contracts from M1..M7
```
