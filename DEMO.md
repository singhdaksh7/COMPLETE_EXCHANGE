# Demo Runbook — INR ↔ USDT Exchange MVP

A step-by-step guide to bring the full stack up locally and walk a client
through the product: KYC, INR deposit, conversion, **spot trading**, **live
order book + candlestick charts**, and withdrawals.

> Platform note: commands are written for **Windows PowerShell** (the dev
> machine). Bash equivalents are noted where the syntax differs.

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20.x LTS | backend + frontend |
| npm | 10.x | bundled with Node 20 |
| Docker Desktop | latest | runs Postgres + Redis |
| Git | any | — |

Two backend processes (User API on `:4000`, Admin API on `:4001`) and the
frontend (`:3000`) run on the host; Postgres (`:5432`) and Redis (`:6379`) run
in Docker.

Install dependencies once:

```powershell
cd backend;  npm install
cd ..\frontend; npm install
```

---

## 2. Start Docker / Postgres / Redis

From `backend/` (the compose file lives there). For the demo we only need the
datastores from compose — the APIs run on the host so logs are visible.

```powershell
cd backend
docker compose up -d postgres redis
docker compose ps        # both should be (healthy)
```

Create the backend env file (defaults already point at the local containers):

```powershell
Copy-Item .env.example .env
```

### One-time database bootstrap

Run these once after the containers are healthy (idempotent — safe to re-run):

```powershell
# 1. Apply the schema
npm run prisma:deploy

# 2. Reference + RBAC bootstrap: assets, chains, permissions, roles,
#    SUPER_ADMIN, and the bootstrap admin row (placeholder password).
Get-Content prisma\seed.sql | docker exec -i cex_postgres psql -U cex -d cex
# bash:  docker exec -i cex_postgres psql -U cex -d cex < prisma/seed.sql

# 3. App seed: system flags + the USDT-INR market + trading.view permission
npm run db:seed

# 4. Set a known demo password for the admin and link SUPER_ADMIN
#    (the seed.sql password is a deliberate placeholder).
npm run admin:reset-local
```

After step 4 you can log into the admin console with the credentials in
[§6](#6-demo-credentials).

---

## 3. Start the User API (`:4000`)

```powershell
cd backend
npm run dev            # http://localhost:4000  (public API, /api/v1)
```

Health check: `http://localhost:4000/health` → `{ "success": true, ... }`.

Optional background processes (only needed to fully complete a **withdrawal**
through broadcast/confirmation in the UI — not needed for trading/charts):

```powershell
npm run dev:worker     # withdrawal broadcast + confirmation worker
npm run dev:scanner    # TRC20 deposit scanner
```

---

## 4. Start the Admin API (`:4001`)

In a separate terminal:

```powershell
cd backend
npm run dev:admin      # http://localhost:4001  (admin API, /admin/v1)
```

---

## 5. Start the Frontend (`:3000`)

```powershell
cd frontend
Copy-Item .env.local.example .env.local   # points at :4000 and :4001
npm run dev                                # http://localhost:3000
```

| Surface | URL |
|---------|-----|
| User app | http://localhost:3000 |
| User login | http://localhost:3000/login |
| Trade + charts | http://localhost:3000/trade |
| Admin console | http://localhost:3000/admin/login |

---

## 6. Demo credentials

**Admin** (after `npm run admin:reset-local`):

| Field | Value |
|-------|-------|
| Email | `admin@exchange.local` |
| Password | `Admin@123456` |
| TOTP code | `000000` (TOTP disabled for the local demo) |

**Users** are created live during the demo via **Register** (email + a strong
password, e.g. `Str0ngPassw0rd!`). Email verification is required by the API; in
local dev the demo scripts flip `email_verified_at` automatically. To verify a
manually-registered user from the UI flow, see the PowerShell snippet in
[§8](#8-powershell-fallback--approve-kyc-if-the-admin-ui-fails).

---

## 7. Demo flow (manual, via the UI)

A clean 5-minute narrative:

1. **Register** two users (e.g. `alice@example.com`, `bob@example.com`) at
   `/register`, then **log in** at `/login`.
   - If login is blocked on "email not verified", run the verify snippet in §8.
2. **Submit KYC** at `/kyc/submit` for each (full name, DOB, PAN e.g.
   `ABCDE1234F`).
3. **Approve KYC** in the admin console: log in at `/admin/login`, open the
   **KYC** queue, approve each user at **tier 1**. (Fallback in §8.)
4. **Fund INR**: as a user, go to `/deposit`, create a deposit; the Razorpay
   **mock** provider + signed webhook credits INR instantly.
5. **Convert** some INR → USDT at `/convert` so a seller has USDT to sell.
6. **Trade** at `/trade?symbol=USDT-INR`:
   - One user places a **LIMIT SELL**; the other places a crossing **LIMIT
     BUY**. Watch the **order book**, **recent trades**, **balances**, the
     **candlestick chart**, and the **24h ticker** (last price / change /
     volume) update **live over WebSocket** (the `Live` badge is green).
   - Toggle chart intervals (`1m / 5m / 15m / 1h / 1d`).
   - Try a **MARKET BUY** (budget) and **MARKET SELL** (quantity).
7. (Optional) **Withdraw** USDT at `/withdraw`: allowlist a TRON address,
   request a withdrawal, approve it in the admin **Withdrawals** queue; with the
   worker running it moves to `BROADCAST → COMPLETED`.

> Tip: to fill the chart quickly with believable candles, use the scripted
> `trading-demo.ts` in [§10](#10-run-trading-demots) before the walkthrough.

---

## 8. PowerShell fallback — approve KYC if the admin UI fails

If the admin console is unavailable, approve a user (and verify their email)
directly against the database. This sets exactly what the trading engine checks
(`status=ACTIVE`, `kyc_status=APPROVED`, `kyc_tier>=1`):

```powershell
# Replace the email with the target user.
$email = 'alice@example.com'
docker exec -i cex_postgres psql -U cex -d cex -c `
  "UPDATE users SET status='ACTIVE', kyc_status='APPROVED', kyc_tier=1, email_verified_at=now() WHERE email='$email';"
```

To only unblock **login** (email verification) without approving KYC:

```powershell
docker exec -i cex_postgres psql -U cex -d cex -c `
  "UPDATE users SET email_verified_at=now() WHERE email='alice@example.com';"
```

Verify:

```powershell
docker exec -i cex_postgres psql -U cex -d cex -c `
  "SELECT email, status, kyc_status, kyc_tier FROM users WHERE email='alice@example.com';"
```

> After flipping KYC in the DB, the user must **log in again** so the new access
> token carries the approved tier.

---

## 9. Run `demo-e2e.ts`

End-to-end verification of the **non-trading** flow over real HTTP: register →
KYC → admin approve → INR deposit (mock + signed webhook) → TRC20 address →
INR↔USDT conversion → USDT withdrawal → broadcast/confirm → completion.

**Requires** the User API (`:4000`) and Admin API (`:4001`) running, and the DB
bootstrapped (§2). The script seeds its own TRON hot wallet and runs the
withdrawal worker cycle in-process, so `dev:worker` is **not** required.

```powershell
cd backend
npx tsx scripts/demo-e2e.ts
```

Expected tail: `✅ END-TO-END DEMO VERIFICATION PASSED`.

---

## 10. Run `trading-demo.ts`

End-to-end verification of the **spot-trading** flow with two users: fund A with
INR and B with USDT, then A LIMIT BUY rests, B LIMIT SELL crosses, the engine
fills the trade, and balances/fees/order book/trades are asserted — plus a
cancel, a MARKET BUY, and a MARKET SELL. This also leaves real trades on the
USDT-INR tape, which populates the **ticker and candlestick chart**.

**Requires** the User API (`:4000`), Admin API (`:4001`), a seeded DB, and Redis.

```powershell
cd backend
npx tsx scripts/trading-demo.ts
```

Expected tail: `✅ TRADING DEMO VERIFICATION PASSED`. Afterwards open
`http://localhost:3000/trade` to show the chart populated with the demo trades.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `docker compose ps` shows unhealthy | `docker compose logs postgres redis`; ensure ports 5432/6379 are free. |
| Admin login fails with bad credentials | Re-run `npm run admin:reset-local`; confirm `seed.sql` was applied (it creates the SUPER_ADMIN role). |
| API won't boot — missing JWT secret | Ensure `backend/.env` exists (`Copy-Item .env.example .env`). |
| Login says email not verified | Run the email-verify snippet in §8. |
| Trade page badge shows `Polling`, not `Live` | The socket dropped; the app still works via REST polling. Check the User API is up and CORS allows `:3000`. |
| Chart is empty | No trades yet on USDT-INR — run `trading-demo.ts` (§10) or place a matched trade. |
