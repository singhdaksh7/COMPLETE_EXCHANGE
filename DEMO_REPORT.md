# Exchange Platform — Staging Demo Report (Stage 3.5)

_Production-readiness + final demo hardening._

## Completed stages
- **3.4A — Manual INR Deposit:** user submits amount + UTR (+ optional proof);
  KYC-gated; duplicate-UTR blocked at the DB; admin approve/reject; credit flows
  exclusively through the double-entry ledger (idempotent, no double credit).
- **3.4B — Secure Admin Management:** separate admin process; per-admin IPv4
  allowlist (login + every request); sub-admin creation; role assign/remove;
  suspend/activate (kills sessions); TOTP reset + self re-enrollment; all
  mutations audited.
- **3.4C — Admin Operations + Maker-Checker:** real operations dashboard counts;
  deposit history with filters + CSV export; AdminLog audit viewer + CSV;
  maker-checker dual approval for large INR deposits (configurable threshold).
- **3.5 — Hardening:** fake client-facing data removed or labelled; empty states;
  security review; deployment verification checklist; this report.

## Deployed URLs
- Frontend (user + admin console): CloudFront distribution, e.g.
  `https://dfk68tws8g8oj.cloudfront.net`
- Public API: `…/api/v1/*` → `cex-staging-api` (ECS)
- Admin API: `…/admin/v1/*` → `cex-staging-admin` (ECS, separate process)

## Test accounts
- **SUPER_ADMIN:** `admin@exchange.local` — password from staging secrets;
  TOTP disabled on staging (use `000000`). Set/rotate via the
  `reset-staging-admin` one-shot task.
- **FINANCE sub-admin:** create from **Admin management** → returns a one-time
  initial password (also usable for the maker-checker second approval).
- **Test user:** any registered user; approve KYC for the demo via the
  `approve-staging-kyc` one-shot task (or the admin KYC page).

## Working flows (verified)
- Auth: register, login, refresh; email-verification + KYC status surfaced.
- Manual INR deposit: KYC-blocked when unapproved → approved user submits →
  duplicate UTR blocked → small deposit single-approval credits → large deposit
  maker-checker (first approval no credit, same admin blocked, second admin
  credits once).
- Admin: SUPER_ADMIN full access; FINANCE can view/approve INR but cannot manage
  admins; READ_ONLY can view dashboards/logs but cannot approve; suspended admin
  cannot log in; IP allowlist blocks non-allowed IPs.
- Operations: dashboard live counts (pending/approved/rejected deposits, pending
  KYC, active/suspended admins, recent admin actions); audit viewer + CSV;
  deposit filters + CSV.
- Trading/wallet: markets + trade page load; empty candle/trade/order states are
  explicit; wallet balances + deposit history load from the ledger.

## Demo data that remains (clearly labelled, not silent)
- **Admin dashboard:** decorative volume/revenue charts, alerts, and the activity
  feed sit under a "⚠️ Sample data" banner; the metric cards + recent-actions
  feed above it are **live**.
- **User dashboard:** "Today's PnL" and "Market Global Overview" carry a
  `SAMPLE` chip; portfolio total is real (balances) with an "indicative ≈ ₹83.20/
  USDT" note. INR/USDT balances and recent transactions are live.
- **Convert page:** rate footer is labelled "Sandbox conversion rate".
- **Landing page:** pre-auth marketing claims (users/volume) — marketing copy,
  not an operational view.

## Known limitations / deferred features
- **USDT/INR valuation rate** on the user dashboard is an indicative constant
  (₹83.20), not a live oracle/quote feed. Deferred.
- **PnL / global market analytics** are not computed — labelled SAMPLE. Deferred.
- **Razorpay / automated gateway INR deposits:** not enabled; manual flow only.
- **Crypto deposit scanner (TRON/BSC):** present but out of this demo's scope;
  runs as a separate worker. No changes made in 3.5.
- **SES / Google OAuth:** integrations exist but are not exercised in this demo;
  untouched. Email verification uses the existing mailer path.
- **Object storage for deposit proof:** `proofKey` is stored; real presigned
  upload is deferred (KYC presign is a stub).
- **Maker-checker** applies to manual INR deposits only; withdrawals retain their
  existing dual-control. Threshold via `MANUAL_INR_DUAL_APPROVAL_THRESHOLD`
  (default ₹50,000).
- **TOTP on staging** is disabled for the bootstrap admin for demo convenience;
  re-enable before any production-like review.

## Security posture
- Admin API is a separate process/origin (`/admin/v1`); the public app never
  mounts admin routes.
- Per-admin IP allowlist enforced at login and on every admin request.
- CORS is a strict env allowlist (`CORS_ORIGINS`) — unknown origins rejected.
- Staging maintenance scripts are hard-gated behind explicit `ALLOW_*=YES`
  flags and never print passwords/secrets.
- RBAC: SUPER_ADMIN bypass + explicit per-permission checks; suspend revokes
  sessions and the cached permission set.
