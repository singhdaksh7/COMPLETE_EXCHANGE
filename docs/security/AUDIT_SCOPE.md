# EXORA — Audit / VAPT Scope

**Stage:** 7.0B/7.0C — Security Hardening + Audit/VAPT Handover Pack
**Environment under test:** STAGING only
**Last updated:** 2026-06-23

This document defines what is in scope and out of scope for the external
cybersecurity audit / VAPT engagement, and the assumptions the engagement
should operate under. It is the authoritative scope reference; the other files
in `docs/security/` build on it.

---

## 1. In-scope modules

The following are deployed to AWS staging and are in scope for testing:

| Area | Notes |
|------|-------|
| **User web app** | Next.js static export, served via CloudFront. Login, KYC, wallet, deposit, withdrawal request, trading, conversion, tax/legal views. |
| **Admin panel** | Separate admin frontend + separate admin API process (port 4001, prefix `/admin/v1`). Reachable only via IP allowlist. |
| **Backend APIs** | User API (port 4000, prefix `/api/v1`) and Admin API (separate process). Express + Prisma + PostgreSQL + Redis. |
| **Authentication / session** | JWT access/refresh (HS256), refresh rotation + reuse detection, Redis session revocation, login lockout, optional admin TOTP, per-admin IP allowlist. |
| **RBAC** | Admin role/permission model (SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT, READ_ONLY). User-side permission model. Maker-checker on sensitive approvals. |
| **KYC / compliance modules** | KYC submission + review, sanctions/PEP/adverse-media screening (mock provider), liveness (mock), risk scoring, monitoring/STR cases, wallet-risk + Travel Rule (mock), evidence packs, retention. |
| **FIU draft / reporting foundation** | Draft generation, validation, internal export. **Drafts only — never transmitted to any government system.** |
| **AML policy engine + compliance workspace (Stage 5.7)** | Policy/rule CRUD, evaluation (review-only), tasks, checklists, maker-checker approvals, SLA tracking. |
| **Tax / legal foundation** | TDS calculation-only, tax statement generation, legal document publish + user acceptance. |
| **Mobile app configuration** | Config/assumptions only — see note below. The app talks to the public staging API; only `EXPO_PUBLIC_*` values are bundled. |

### Mobile note
The mobile app build is **not finalized / not frozen** for production release in
this stage. Only its **configuration and security assumptions** are in scope
(public API base URL, no secrets in the bundle, transport security). The final
client-customized APK / iOS build is **out of scope** until frozen.

---

## 2. Out-of-scope modules

These are **mocked or not implemented** and must not be tested as if live:

- **Real FIU submission** — no government network integration exists. FIU output is internal draft/export only.
- **Real tax filing** — TDS/tax is calculation-only; no filing integration.
- **Real banking / payment rails** — Razorpay runs in `mock` mode in staging. No live INR settlement.
- **Real custody / HSM / withdrawal signing** — `WITHDRAWAL_SIGNER=mock`; testnet-only signing for crypto. No production custody/HSM.
- **Production mainnet funds** — staging uses testnet chains (TRON/ETH/BSC testnet). No mainnet value at risk.
- **Final client-customized mobile APK / iOS** — not frozen in this stage.
- **Underlying AWS managed-service internals** (RDS engine, ElastiCache engine, CloudFront edge) beyond configuration review — these are AWS's responsibility under the shared-responsibility model. Configuration (public access, security groups, TLS) IS in scope.

---

## 3. Staging-only assumptions

The staging environment intentionally relaxes some controls via explicit,
named acknowledgement flags (see `backend/src/lib/prod-safety.ts`). These are
**staging-only and MUST be false/removed in production**:

- `ALLOW_MOCK_PROVIDERS=true` — KYC/screening/price/chain providers are offline mocks.
- `ALLOW_MOCK_WITHDRAWAL_SIGNER=true` — withdrawals use a mock/testnet signer.
- `ALLOW_UNVERIFIED_EMAIL_LOGIN=true` — email verification not enforced for test convenience.
- `ALLOW_ADMIN_LOGIN_WITHOUT_TOTP=true` — admin TOTP not enforced in staging.
- `ALLOW_LOG_MAIL_PROVIDER` / `MAIL_PROVIDER` — mail may be logged rather than sent.
- `CHAIN_ENV=testnet`, testnet RPCs, testnet cold/hot addresses.

A production deployment that leaves any of these enabled is a **production
blocker** (see SECURITY_HARDENING_REPORT.md).

---

## 4. Known mock providers (staging)

| Provider | Mode | Real integration status |
|----------|------|-------------------------|
| KYC / DigiLocker / liveness | `mock` | Not integrated |
| Sanctions / PEP / adverse-media screening | `mock` | Not integrated |
| Wallet-risk provider | `mock` | Not integrated |
| Price provider | `mock` | Not integrated |
| Razorpay (INR deposits) | `mock` | Not integrated |
| Withdrawal signer | `mock` / testnet-local | No HSM/custody |
| Chain scanners (TRON/ETH/BSC) | testnet | No mainnet |
| FIU submission | none | Draft/export only |
| Tax filing | none | Calculation only |

---

## 5. Disclaimer

This scope and the accompanying reports describe an **internal security
hardening pass**. They are **not** a legal certification, an FIU/PMLA
compliance certification, or a substitute for the independent external VAPT
this pack is preparing for.
