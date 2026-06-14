# Remaining Work — Path to Production

This MVP is feature-complete for a demo and a single-node local deployment. The
items below are the gap between the demo and a production launch. They are
intentionally **out of scope** for the MVP and are listed roughly in priority
order.

---

## 1. Production deployment
- **Multi-process / multi-replica deployment** behind a load balancer. Today the
  matching engine serializes per market with an **in-process** lock; a horizontally
  scaled deployment needs a Postgres advisory lock (or a dedicated single-writer
  matching service) keyed on the market id.
- **Secrets & config management**: real JWT secrets, DB/Redis credentials, and
  provider keys via a secrets manager (not `.env`). Rotate the placeholder
  bootstrap admin credentials and the seed.sql placeholder hash.
- **JWT hardening**: migrate access tokens from HS256 to **RS256** with key
  rotation (noted in `ARCHITECTURE.md`).
- **Migrations & seeding** as a controlled release step (the compose `migrate`
  one-shot is a starting point); managed Postgres with backups/PITR and a managed
  Redis.
- **Containerized admin API / worker / scanner** services (compose currently
  ships the user API only) with health checks, autoscaling, and graceful
  shutdown wired into the orchestrator.
- TLS termination, WAF, and a CDN for the frontend.

## 2. Redis adapter for WebSockets
- The Socket.IO layer is currently **single-node** (in-process event bus). For
  more than one API replica, add the **Socket.IO Redis adapter** (or Redis
  streams pub/sub) so `trade.executed` / `orderbook.updated` / `order.updated` /
  `balance.updated` fan out across all nodes.
- Sticky sessions or a stateless reconnect strategy at the load balancer.

## 3. Monitoring, logging & observability
- Ship structured logs to a central store (the app already emits JSON logs with
  PII redaction and per-request correlation ids).
- **Metrics** (Prometheus/OpenTelemetry): order/trade throughput, match latency,
  ledger posting errors, socket connections, queue depths.
- **Tracing** across the layered services and the worker/scanner.
- **Alerting** on error rates, withdrawal backlog, scanner lag, reconciliation
  diffs, and kill-switch state.
- **Reconciliation** jobs and balance-snapshot auditing run on a schedule with
  alerts on drift (the schema/recon scaffolding exists).

## 4. FIU / AML compliance automation
- **Transaction monitoring** rules (velocity, structuring, threshold) and case
  management, beyond the current manual KYC review.
- **Sanctions / PEP screening** and ongoing watchlist re-screening.
- **FIU-IND reporting**: automated CTR/STR generation and filing workflows.
- **Travel Rule** support for crypto withdrawals/deposits.
- **TDS** reporting/remittance automation (conversion TDS is computed today, but
  not reported to authorities) and tax statements.
- Configurable per-tier limits, source-of-funds capture, and audit-grade
  retention.

## 5. Mobile app
- Native iOS/Android (or React Native) client consuming the same public API and
  WebSocket feed.
- Push notifications for fills, deposits, withdrawal status, and price alerts.
- Mobile-specific auth hardening (biometrics, device binding) and app-store
  compliance.

## 6. Real Razorpay & live blockchain keys
- **Razorpay live provider**: switch `RAZORPAY_PROVIDER=live` with real
  `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / webhook secret; the app
  fail-closes if live mode is set without real credentials. Production webhook
  endpoint, signature rotation, settlement reconciliation, and refunds.
- **Live blockchain integration**: replace mock TRON provider/signer with a real
  node/provider (and KMS-backed signing) for TRC20 deposit scanning, sweeps, and
  withdrawal broadcasting; gas/energy management; reorg handling at production
  confirmation depths; support for ERC20/BEP20 USDT (schema already models these
  chains).
- **Real KYC provider** (DigiLocker/Aadhaar/PAN verification) in place of the
  mock, and a real price oracle for conversion quotes instead of the mock price
  provider.

---

## Known MVP limitations (by design)
- **USDT-INR only** — single market.
- **Candles/ticker computed per request** from the trades tape (no
  pre-aggregation worker yet); the `candles` / `market_tickers` tables exist for
  that future path.
- **Mock providers** for Razorpay, TRON chain, address derivation, withdrawal
  signing, KYC, and pricing.
- **Single-node** matching + realtime (see §1 and §2).
- Tokens stored in `localStorage` on the frontend (a production app would prefer
  httpOnly cookies).
