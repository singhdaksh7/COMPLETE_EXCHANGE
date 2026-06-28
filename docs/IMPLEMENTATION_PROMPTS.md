# EXORA — Phase-wise Implementation Prompts (FIU/Audit Demo, target 15 July 2026)

> Hand each phase below to Cursor / Claude / Kilo **one at a time**. Do not run them
> all together. Finish + validate one phase before starting the next.
>
> **Platform direction (do NOT violate in any phase):**
> - Mode is `INR_ONLY`. Crypto deposit/withdrawal/wallet stay **globally disabled**.
> - Do **not** build live crypto rails, store private keys, or do automatic on-chain withdrawals.
> - Crypto code stays locked behind the global compliance flags + per-user controls.
> - Everything new must respect the existing feature-gate + double-entry ledger patterns.

---

## Grounding facts (read before any phase)

These are real, verified facts about the repo. Use them; don't re-guess.

**Repo layout**
- Backend: `backend/` — Express + Prisma + TypeScript. Modules in `backend/src/modules/<name>/` as
  `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.validators.ts`, `*.types.ts`.
  Admin variants are `*.admin.routes.ts` / `*.admin.controller.ts`. Two servers: `src/server.ts` (user API),
  `src/admin-server.ts` (admin API).
- Frontend: `frontend/` — Next.js App Router. User pages `frontend/app/<route>/page.tsx`;
  admin pages `frontend/app/admin/<route>/page.tsx`.
- Mobile: `mobile/` — Expo + `expo-router` + `expo-secure-store` (already scaffolded, EAS configured in `eas.json`).

**Feature gating (Stage 15) — `backend/src/modules/feature-controls/`**
- Two layers: GLOBAL flags (`config.featureFlags`) AND per-user `UserFeatureControls`. Effective = `global && user`.
- Positive user flags include `canWithdrawInr`, `canDepositInr`, `canTradeSpot`. Restriction flags include
  `manualReviewBeforeWithdrawal`, `underComplianceReview`, `blockHighRiskActivity`.
- Global gates: `inrWithdrawalsGlobalEnabled`, `inrDepositsGlobalEnabled`, `tradingGlobalEnabled`, plus the three crypto ones (OFF).
- Enforcement: `featureControlsService.assertEnabled(userId, flags)` throws `ForbiddenError('FEATURE_DISABLED_FOR_USER')`.
  There is a `requireUserFeature` middleware wrapping it. `/auth/me` returns `features` (`UserFeatureMap`:
  `inrDeposit, inrWithdrawal, trading, cryptoWallet, cryptoDeposit, cryptoWithdrawal`) + `globalFeatureStatus` (`mode: INR_ONLY|FULL`).
- **Frontend must read `features` from `/auth/me`, never raw per-user controls.**

**Ledger — `backend/src/modules/ledger/`**
- Double-entry. Post via `ledgerService.post({ kind, referenceType, referenceId, metadata, lines }, ctx)`.
- `ledgerService.post` is **idempotent on `(referenceType, referenceId)`** — reuse this for all idempotency.
- `AccountKind` enum: `USER_AVAILABLE, USER_LOCKED, FEE_REVENUE, TDS_PAYABLE, HOT_WALLET, COLD_WALLET,`
  `GATEWAY_CLEARING, MANUAL_BANK_CLEARING, SWEEP_CLEARING, LIQUIDITY, SYSTEM`.
- Each posting line: `{ kind: AccountKind, userId: string|null, asset, direction: 'DEBIT'|'CREDIT', amount }`. Lines must balance.

**INR money model**
- `InrTransaction` table is shared by deposits AND withdrawals via `type: InrTxnType` (`DEPOSIT | WITHDRAWAL`).
- `InrTxnStatus` enum currently: `INITIATED, PENDING, SUCCESS, FAILED, REVERSED` (no APPROVED/PAID — see Phase 16 decision).
- Maker-checker fields already on the row: `firstApprovedBy/firstApprovedAt`, `reviewedBy/reviewedAt`, `rejectionReason`,
  `bankRef`, `utr`, `method`, `metadata`, `ledgerTxnId`. Unique idempotency indexes:
  `(provider, providerPaymentId)` and `(provider, utr)`.
- `BankAccount` table: `accountNumberEnc (Bytes, encrypted)`, `ifsc`, `holderName`, `verifiedAt`, soft-delete `deletedAt`. **No UPI column yet.**
- Reference manual-INR-deposit flow lives in `backend/src/modules/deposit/deposit.service.ts`
  (`createManualDeposit`, `approveManualDeposit`, `rejectManualDeposit`) — **mirror this pattern exactly** for withdrawals
  (idempotency guards (a) status short-circuit, (b) ledger `(referenceType, referenceId)` dedupe, (c) conditional `updateMany WHERE status=...`).

**Audit / notifications**
- Audit: `recordAudit({ actorType, actorId, action, entityType, entityId, ip, userAgent, requestId, metadata })` from `backend/src/lib/audit`.
- Admin log: `<repo>.writeAdminLog({ adminId, action, targetType, targetId, reason, beforeState, afterState, ip, requestId })`.
- Notifications: `notificationService.notify({ userId, type, metadata })`.

**The existing `backend/src/modules/withdrawal/` module is CRYPTO (CryptoWithdrawal, signer, broadcast, worker). Do NOT extend it for INR.** The existing `frontend/app/withdraw/page.tsx` and `frontend/app/admin/withdrawals/page.tsx` are crypto-oriented — verify before reuse; Phase 16 INR withdrawal is a separate path.

**Validation commands**
- Backend: `cd backend && npm run typecheck && npm run lint && npm test`
- Backend migrate (local): `cd backend && npm run prisma:migrate`
- Backend seed: `cd backend && npm run db:seed`
- Frontend: `cd frontend && npm run build && npm run lint`
- Mobile: `cd mobile && npm run typecheck && npm run lint`

---

## PHASE 0 — Stage 15 deployment verification (no new features)

**Context**
Stage 15 backend is deployed (`cex-staging-api:50`, `cex-staging-admin:48`), migration done, `PlatformMode = INR_ONLY`,
crypto globally disabled. We need to confirm the deployed frontend + gates actually match before building Phase 16+.

**Goal**
Verify (and fix only if broken) that the INR-only posture is correct end-to-end. No new features.

**Files/modules likely involved**
- `frontend/app/deposit/page.tsx`, `frontend/app/wallet/page.tsx`, `frontend/app/withdraw/page.tsx`, `frontend/app/trade/page.tsx`
- Frontend `/auth/me` consumer (feature-map hook/context) — find where `features`/`globalFeatureStatus` is read.
- `frontend/app/admin/**` System/compliance page + Admin User Detail → Feature Controls panel.
- Backend `feature-controls` gates; crypto routes (`backend/src/modules/wallet`, `deposit` crypto network routes).

**Requirements**
- User UI hides crypto deposit/withdrawal/wallet when `features.cryptoDeposit/cryptoWithdrawal/cryptoWallet === false`.
- Deposit page shows INR only; crypto tab hidden.
- Admin System page shows compliance mode `INR_ONLY`.
- Admin User Detail → Feature Controls shows three columns: User permission / Global status / Effective access.
- Direct crypto APIs return `403 FEATURE_DISABLED_FOR_USER` (or global-disabled equivalent).
  - **Verified real endpoints (the spec's `/deposits/crypto/networks` does not exist):**
    crypto networks = `GET /api/v1/wallets/networks` (gated `canAccessCryptoWallet`);
    crypto address = `POST /api/v1/wallets/addresses` (gated `canAccessCryptoWallet` + `canDepositCrypto`).
- INR deposit still works (manual = `POST /api/v1/inr/deposits/manual`, gated `canDepositInr`).

**Edge cases**
- A user with `canDepositCrypto = true` per-user must STILL see crypto hidden (global OFF wins).
- `/auth/me` must never leak raw per-user controls to the client; only the AND-ed `features` map.
- Logged-out / token-expired states must not crash the page (render a safe state).

**Tests**
- Frontend: assert crypto blocks are not rendered when feature flags are false (component/unit test or snapshot).
- Backend: existing feature-gate tests pass; add one asserting `/api/v1/deposits/crypto/networks` → 403.

**Validation commands**
- `cd frontend && npm run build && npm run lint`
- `cd backend && npm run typecheck && npm test`
- Manual: `GET /api/v1/deposits/crypto/networks` (authed) → 403; admin System shows INR_ONLY; deposit page = INR only.

**What NOT to change**
- Do not enable any crypto flag. Do not alter ledger, deposit crediting, or migrations.
- Do not refactor feature-controls types. This phase is verify-and-patch only.

---

## PHASE 16 — INR Withdrawal (manual payout)

**Context**
Users can deposit INR and get credited via the double-entry ledger. We now need the reverse: a **manual** INR
withdrawal flow for the FIU/audit demo. No automatic bank transfer — an admin marks it paid with a UTR.
Mirror the existing manual-deposit pattern in `backend/src/modules/deposit/deposit.service.ts`.

**Goal**
Complete user + admin INR withdrawal flow with reserved funds, idempotent state transitions, and full audit trail.

**Files/modules likely involved (create a NEW module — do not touch the crypto `withdrawal` module)**
- New: `backend/src/modules/inr-withdrawal/` (`routes`, `admin.routes`, `controller`, `admin.controller`, `service`,
  `repository`, `validators`, `types`). Register routes in `src/server.ts` (user) and `src/admin-server.ts` (admin).
- Reuse: `InrTransaction` (type `WITHDRAWAL`), `BankAccount`, `ledgerService`, `featureControlsService`,
  `recordAudit`, `writeAdminLog`, `notificationService`, `config.inrOps` (limits, dual-approval threshold).
- Prisma: `backend/prisma/schema.prisma` + a new migration in `backend/prisma/migrations/`.
- Frontend: new `frontend/app/wallet/inr-withdraw/page.tsx` (or section in `wallet`), withdrawal history view,
  bank/UPI management UI. Admin: `frontend/app/admin/inr-withdrawals/page.tsx`.

**Decision to make explicitly (pick one, document in PR):**
- `InrTxnStatus` has no `APPROVED`/`PAID`. Either **(A)** add enum values `REQUESTED, APPROVED, PAID, REJECTED` via
  migration, **or (B)** reuse existing (`PENDING`=requested/approved tracked by `firstApprovedBy`/`reviewedBy`, `SUCCESS`=paid,
  `FAILED`=rejected) and store the fine-grained stage in `metadata.withdrawalStage`. **Recommended: (A)** for audit clarity —
  add a dedicated `InrWithdrawalStatus` enum or extend `InrTxnStatus`; keep the migration additive (no value renames/drops).
- UPI: `BankAccount` has no UPI column. Add `upiId String?` (nullable) + make `accountNumberEnc/ifsc` nullable when UPI is used,
  OR add a `payoutMethod` discriminator. Keep account number **encrypted** (`Bytes`), never plaintext.

**Requirements — user side**
- Add/select a bank account or UPI (reuse `BankAccount`; validate IFSC format, account number, holder name, or UPI handle).
- Request INR withdrawal (amount + chosen payout destination).
- View withdrawal history (own only; cursor-paginated like deposits).
- Block the request when: `canWithdrawInr` effective = false (gate), KYC not APPROVED (match deposit's `KYC_REQUIRED` policy),
  insufficient **available** balance, amount below/above `config.inrOps` limits, or a conflicting pending withdrawal exists
  (if policy requires — make it configurable).
- If `manualReviewBeforeWithdrawal` restriction is set, still allow request but it must require admin review (it already will).

**Requirements — ledger (idempotent, all via `ledgerService.post`)**
- On request → **reserve**: `DEBIT USER_AVAILABLE` / `CREDIT USER_LOCKED` (asset `INR`),
  `referenceType='inr_withdrawal'`, `referenceId=<withdrawalId>`, `kind='INR_WITHDRAWAL_LOCK'`.
- On admin **reject** → **release**: `DEBIT USER_LOCKED` / `CREDIT USER_AVAILABLE`, `kind='INR_WITHDRAWAL_RELEASE'`,
  distinct `referenceId` suffix (e.g. `<id>:release`) so it doesn't collide with the lock posting.
- On admin **mark paid** → **finalize**: `DEBIT USER_LOCKED` / `CREDIT MANUAL_BANK_CLEARING`, `kind='INR_WITHDRAWAL_PAYOUT'`,
  `referenceId=<id>:payout`. (Confirm `MANUAL_BANK_CLEARING` is the intended payout counterpart; if a dedicated payout
  system account is preferred, add one to `AccountKind` — but `MANUAL_BANK_CLEARING` matches the existing manual-INR semantics.)
- **Idempotency is mandatory**: approve twice = no double-move; reject twice = no double-release; mark-paid twice = no double-finalize.
  Use ledger `(referenceType, referenceId)` dedupe + conditional `updateMany WHERE status=<expected>` (exactly the deposit pattern).

**Requirements — admin side**
- List withdrawal requests (filter by status; cursor pagination; CSV export like deposits, no secrets).
- Approve / reject a pending withdrawal; mark an approved withdrawal as **manually paid** (UTR/reference **required**, internal note optional).
- Honour the existing dual-approval threshold (`config.inrOps.dualApprovalThreshold`) using `firstApprovedBy`/`reviewedBy` — same admin can't do both steps.
- Admin sees: user, amount, payout destination (bank/UPI), KYC status, risk flags, current balance, and a request timeline.
- Every admin action writes `recordAudit` + `writeAdminLog`.

**Security**
- User routes behind auth + `requireUserFeature('canWithdrawInr')`. Admin routes behind admin auth + permission check
  (match how `deposit.admin.routes.ts` is protected).
- Users can only read/cancel their own withdrawals — **no IDOR** (always filter by `userId`, 404 on mismatch like deposits do).
- Never return raw Prisma/DB errors to the client (use `AppError`/typed errors; the global error handler formats them).
- Mask bank account numbers in API responses (last 4 only); never return decrypted full number to the user list.

**Edge cases**
- Reserve must fail atomically if available balance < amount at posting time (re-check inside the txn, not just at validation).
- Reject after already-paid → conflict `ALREADY_PAID`; mark-paid on a rejected/non-approved row → conflict `INVALID_STATE`.
- Cancel-by-user (if allowed) only while still pending and before approval; cancel must release the lock idempotently.
- Concurrent approve + reject race → conditional `updateMany` ensures exactly one wins; the loser is a no-op.
- Amount precision: enforce 2-dp INR (reuse the deposit's paise/precision guard) — reject sub-paise.
- Deleted/soft-deleted bank account selected → reject `BANK_ACCOUNT_NOT_FOUND`.

**Tests (`backend/test/unit/`)**
- request: success; blocked by gate; blocked by KYC; blocked by insufficient balance; blocked by limits.
- approve: success; second approval by same admin rejected; idempotent (twice = single move).
- reject: success + funds released; idempotent (twice = single release); reject-after-paid conflict.
- mark paid: requires UTR; success finalizes; idempotent (twice = single finalize).
- ledger invariants: locked+available conserved across reserve→release; reserve→payout removes from user correctly.
- IDOR: user A cannot read user B's withdrawal.

**Validation commands**
- `cd backend && npm run prisma:migrate && npm run typecheck && npm run lint && npm test`
- `cd frontend && npm run build && npm run lint`
- Manual smoke: deposit INR → admin approve → balance credited → request INR withdrawal → admin approve →
  admin mark paid with UTR → user sees PAID/COMPLETED → available balance reduced by exactly the amount.

**What NOT to change**
- Do not modify the crypto `withdrawal` module or crypto ledger/account kinds.
- Do not change deposit crediting logic. Do not weaken the ledger idempotency contract.
- Do not store payout secrets or auto-transfer funds. Migration must be additive only (no destructive enum/column changes).

---

## PHASE 17 — Market seed + trading readiness

**Context**
Trade/markets pages throw "Market not found" because assets/markets aren't seeded in staging. Trading must be a
stable demo (no live liquidity needed). There is already a `market:seed-staging` script (`seed-demo-market.js`)
and `backend/prisma/seed.ts` — reuse/extend rather than inventing a new mechanism.

**Goal**
Idempotent asset+market seed and safe empty states so trade/markets never show broken 404s.

**Files/modules likely involved**
- `backend/prisma/seed.ts` and/or `backend/scripts/seed-demo-market.*` (extend; keep idempotent via upserts).
- `backend/src/modules/trading/` (`trading.service.ts`, `trading.controller.ts`, `trading.repository.ts`, `trading.engine.ts`),
  `backend/src/modules/conversion/` for price.
- Market/asset Prisma models in `schema.prisma`.
- Frontend `frontend/app/markets/page.tsx`, `frontend/app/trade/page.tsx` (empty states), order book / trades / candles components.

**Requirements**
- Idempotent seed for assets: `INR, USDT, BTC, ETH, BNB` (upsert by symbol — running twice changes nothing).
- Idempotent seed for markets: `BTC-USDT, ETH-USDT, BNB-USDT, USDT-INR` with valid `tickSize`, `stepSize`,
  `minNotional`, maker/taker fees (sane non-zero values; document units).
- Market list/detail APIs return valid empty/default responses (never 404 spam) for the default dashboard/trade page.
- Safe empty states on the UI: no order book yet, no recent trades, no candles, no user orders.
- Trading routes respect the `TRADING` feature flag: order place/cancel APIs return `403` when `canTradeSpot` effective = false.
- Admin/user UI must not break when a market has zero liquidity.

**Edge cases**
- Re-running the seed after a partial run must converge (upsert, not insert).
- A market with no candles must return an empty series, not throw.
- Trading globally paused (`tradingGlobalEnabled=false`) but a user has resting orders → cancel must still work
  (`canCancelOrders` is intentionally NOT globally gated — preserve that).
- Decimal precision on tick/step must reject malformed orders, not 500.

**Tests**
- Seed idempotency test: run seed twice → identical row counts, no duplicates.
- Market API returns empty/default shapes (order book, trades, candles) without throwing.
- Trading gate: enabled user reaches trade APIs; disabled user → 403 on place/cancel.

**Validation commands**
- `cd backend && npm run db:seed && npm run db:seed` (twice — must be clean) `&& npm run typecheck && npm test`
- `cd frontend && npm run build && npm run lint`
- Manual: trade page loads with no "Market not found"; disabled-trading user can't access trade page/APIs.

**What NOT to change**
- Do not enable crypto deposit/withdrawal/wallet (BTC/ETH/BNB as **tradable assets** only, not funding rails).
- Do not seed real liquidity or fake balances into user accounts. Keep seeds in seed scripts, not in migrations that run in prod blindly.

---

## PHASE 18 — Security hardening for cybersecurity audit

**Context**
External auditors will probe the platform. Harden existing endpoints; do not add features. Most controls
(feature gates, audit log, typed errors, double-entry ledger) already exist — this phase verifies + fills gaps.

**Goal**
Rate limits, strict CORS, security headers, no raw error leakage, complete audit coverage, RBAC verification, safe access-denied UI.

**Files/modules likely involved**
- `backend/src/server.ts`, `backend/src/admin-server.ts` (CORS, helmet/headers, rate-limit middleware).
- `backend/src/middleware/` (`error-handler.ts`, `request-context.ts`, validate, not-found) — verify no stack/Prisma leakage; ensure request id returned.
- Auth/OTP/KYC/deposit/withdrawal/admin routes (attach rate limiters).
- `backend/src/lib/audit` + each module's `writeAdminLog` call sites (coverage audit).
- Frontend: shared `AccessUnavailable`/error boundary component for blocked/blank screens.

**Requirements**
- Rate limits on: login, register, OTP/email verification, KYC submit, INR deposit create, INR withdrawal request,
  and admin sensitive actions. (Per-IP and/or per-user; document the limits.)
- Strict CORS allowlist (env-driven origins for user + admin apps; no `*` with credentials).
- Security headers present (helmet or equivalent): HSTS, X-Content-Type-Options, frame options, referrer policy, CSP where feasible.
- API responses never expose stack traces / raw Prisma / DB errors — global error handler returns typed `{ code, message, requestId }`.
- Request id logged and returned (header or body) for correlation.
- Audit logs exist for: KYC decisions, deposit approve/reject, **withdrawal approve/reject/paid (Phase 16)**,
  feature-access changes (already present), admin login/security events (if available).
- Verify backend gates: crypto deposit/withdrawal/wallet disabled in INR_ONLY; trade blocked when disabled;
  INR deposit blocked when disabled; INR withdrawal blocked when disabled.
- Verify RBAC: non-admin cannot reach admin APIs; normal admin cannot reach super-admin-only controls (where applicable — see `admin-rbac` module).
- Frontend: safe `AccessUnavailable` pages instead of broken/blank screens on 401/403.
- Prepare audit test credentials (super admin, normal admin, KYC-pending user, KYC-approved user, feature-blocked user)
  via seed/script — **no real secrets**, document-only/placeholder values rotated before handover.

**Edge cases**
- Rate limiter must not lock out the demo presenter — set demo-friendly thresholds and document them.
- Error handler must still surface validation messages (field-level) without leaking internals.
- CORS preflight for admin app must succeed; credentials mode correct.
- An IDOR probe (`GET /withdrawals/:otherUserId`) returns 404/403, never another user's data.

**Tests (`backend/test/`)**
- Rate-limit middleware returns 429 after threshold on login/register/OTP.
- Error handler maps a thrown Prisma error to a generic typed response (no `P2002`, no SQL, no stack).
- RBAC: non-admin → 401/403 on an admin route; missing-permission admin → 403.
- Gate matrix test: each (feature, INR_ONLY) combination returns expected 200/403.

**Validation commands**
- `cd backend && npm run typecheck && npm run lint && npm test`
- `cd frontend && npm run build && npm run lint`
- Manual security smoke: blocked APIs → 403; non-admin admin API → 401/403; invalid ids don't leak; raw DB errors invisible.

**What NOT to change**
- Do not relax any feature gate or RBAC check to make a test pass.
- Do not put real production secrets in seeds, docs, or the repo. Do not disable audit logging anywhere.

---

## PHASE 19 — Mobile MVP (Expo, INR-only)

**Context**
`mobile/` is already an Expo + `expo-router` app with `expo-secure-store` available and EAS configured (`mobile/eas.json`).
Build the MVP screens against the **same backend API**, respecting the `/auth/me` feature map. INR-only; crypto hidden.

**Goal**
Working Android internal build covering core INR flows for the FIU/client demo.

**Files/modules likely involved**
- `mobile/app/**` (expo-router screens), `mobile/src/**` (api client, auth/token storage, feature-map context), `mobile/.env.example`.
- Reuse backend endpoints already used by web: auth/login/register, `/auth/me`, KYC status, ledger/wallet balance,
  INR deposit create, INR withdrawal request (Phase 16), deposit/withdrawal history, markets/trade read.

**Scope (build)**
- Login / register, Dashboard, KYC status, INR balance/wallet, INR deposit request, INR withdrawal request,
  market/trade basic screen, withdrawal/deposit history, profile/settings.
- Crypto hidden/disabled driven by the `/auth/me` feature map (`cryptoDeposit/cryptoWithdrawal/cryptoWallet`).

**Do NOT build**
- Crypto deposit/withdrawal, automatic wallet signing, advanced charts, push notifications (unless trivial),
  biometric login, heavy animations.

**Technical requirements**
- Same backend API base (env-driven via `.env`/`app.json`). Token stored in `expo-secure-store`.
- Respect feature map from `/auth/me`; show a clean disabled state when a feature is blocked (no blank/broken screens).
- Polished but simple UI. Produce an Android APK/internal build via EAS for the demo.

**Edge cases**
- Token expiry → redirect to login, no crash. Offline / network error → friendly retry state.
- Feature blocked (e.g. `inrWithdrawal=false`) → disabled CTA with explanation, not a dead button.
- KYC pending → withdrawal/deposit gated with a "complete KYC" prompt mirroring backend policy.

**Tests**
- `cd mobile && npm run typecheck && npm run lint`.
- Smoke (manual on device/emulator): login → dashboard shows real user → INR deposit request → INR withdrawal request →
  crypto not visible.

**Validation commands**
- `cd mobile && npm run typecheck && npm run lint`
- EAS build (Android internal) succeeds; manual smoke per above.

**What NOT to change**
- Do not add crypto UI/APIs. Do not bypass `/auth/me` feature gating. Do not hardcode secrets/tokens. Do not fork backend logic into the app.

---

## PHASE 20 — FIU / audit handover package

**Context**
Final deliverable for the client + FIU + cybersecurity auditors. Documentation + a test package. No code behaviour changes.

**Goal**
A complete, accurate handover set describing the INR-only platform, its controls, and the locked crypto posture.

**Files/modules likely involved**
- `docs/` (new): all documents below. Pull facts from real code (feature-controls, ledger, audit, RBAC, schema) — do not invent.

**Documents needed**
1. Platform Overview
2. Architecture Diagram
3. Data Flow Diagram (INR deposit/withdrawal/trade)
4. User/Admin Role Matrix (from `admin-rbac` module)
5. KYC/AML Compliance Note
6. Crypto-Disabled / INR-Only Mode Note (see required statement below)
7. Security Controls Checklist (map to Phase 18)
8. API Inventory (enumerate user + admin routes)
9. Test Credentials (placeholders; rotate before sharing; no real secrets)
10. Deployment Environment Summary (ECS api/admin, S3+CloudFront frontend, RDS)
11. Backup and Incident Response Plan
12. Known Limitations / Roadmap (crypto as controlled future capability)

**Required statement to include verbatim (doc #6):**
> Crypto deposit and withdrawal modules are present only as controlled future capability. They are globally disabled
> pending FIU/compliance approval. Normal users cannot access crypto funding UI or APIs. Admin feature controls and
> backend gates enforce this restriction.

**Edge cases / accuracy**
- Every claim must match the deployed code (e.g. the exact gate flags, the double-entry ledger, audit coverage).
- API inventory must reflect actual routes registered in `server.ts` / `admin-server.ts`.

**Tests / validation**
- Cross-check each doc against code: feature flags (`feature-controls.types.ts`), ledger account kinds, audit calls, RBAC permissions.
- Peer review by you before sending to the client.

**What NOT to change**
- No code/behaviour changes in this phase. Do not include real secrets or live credentials.

---

## Schedule (from the client plan)
- 28–30 Jun: Phase 0 verification + Phase 16 INR withdrawals.
- 1–3 Jul: Phase 17 market seed / trading readiness.
- 4–6 Jul: Phase 19 Mobile MVP core screens/API.
- 7–9 Jul: Phase 18 security hardening.
- 10–11 Jul: Phase 20 FIU/audit documents.
- 12–13 Jul: End-to-end testing + bug fixing only.
- 14 Jul: Release freeze, backup, demo rehearsal.
- 15 Jul: Client FIU/audit presentation.
