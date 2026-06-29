# EXORA — Platform Overview

**Mode: INR_ONLY staging/demo MVP (India).**
This document describes EXORA's architecture for compliance and audit reviewers.
It reflects the system as built; where a capability is mock/placeholder it is
labelled as such.

---

## 1. What EXORA is

EXORA is a centralized exchange platform built for India-focused use cases,
currently operating in **INR_ONLY** mode as a staging/demo MVP. In this mode the
product exercises INR rails, trading, ledgering, KYC, and compliance workflows
**with crypto deposit/withdrawal/funding globally disabled** (see
`inr-only-mode.md`).

## 2. Components

- **User app (frontend / mobile):** account signup/login, KYC submission, INR
  deposit (gateway + manual), trading, balances/wallet views, transaction
  history.
- **Admin panel:** separate admin authentication and API surface; KYC review,
  INR deposit approval (maker-checker), compliance case management, user
  management, RBAC administration, operational dashboards.
- **Backend APIs:** Node.js/TypeScript (Express) services, organized by module
  (`backend/src/modules/*`), with strict request validation (zod), rate limiting,
  and structured logging.
- **Double-entry ledger:** the single source of truth for balances. Every
  money movement posts balanced debit/credit entries inside SERIALIZABLE
  transactions; user balances cannot go negative; postings are idempotent on a
  reference id; ledger entries are append-only (DB trigger). *(Ledger settlement
  logic is out of scope for changes in this work.)*
- **Manual INR flow:** users submit a deposit with a UTR/reference; no money
  moves until an admin approves. Deposits at/above a threshold require
  maker-checker dual approval by two different admins.
- **Matching engine + trading:** deterministic order matching with fund-locking
  (available → locked) and idempotent settlement through the ledger. *(Engine
  logic is out of scope for changes in this work.)*
- **Compliance subsystem:** KYC lifecycle, screening (mock), transaction
  monitoring rules, compliance cases, retention policy registry, and FIU draft
  reporting (draft-only, never transmitted).
- **Data stores:** PostgreSQL (system of record — users, KYC/PII, ledger, audit
  trails, INR transactions) and Redis (sessions, rate-limit counters, OTP and
  verification token hashes — ephemeral).

## 3. Security posture (summary)

- Argon2id password hashing; JWT access + rotating refresh tokens with reuse
  detection; instant session revocation.
- Admin MFA (TOTP, secret encrypted at rest), RBAC, IP allowlist, last-super-
  admin protection, append-only admin action logs.
- PII (PAN, Aadhaar reference) encrypted at rest with AES-256-GCM; logs redact
  passwords, tokens, OTP/TOTP secrets, private keys, and PII.
- Production boot guards reject unsafe flags and dev/default secrets in real
  production.

Full control evidence: `docs/security/vapt-evidence-pack.md`.

## 4. Data flow (high level)

```
User app ─▶ Backend API ─▶ (zod validate, authn/z, rate-limit, idempotency)
                         ├─▶ KYC module ─▶ Postgres (encrypted PII) + provider (mock)
                         ├─▶ INR deposit ─▶ Razorpay (gateway) / manual ─▶ Ledger
                         ├─▶ Trading ─▶ Matching engine ─▶ Ledger
                         └─▶ Audit trail (append-only audit_logs / admin_logs)
Admin panel ─▶ Admin API (separate auth, RBAC, IP allowlist) ─▶ review/approve
```

## 5. What is NOT enabled in this mode

- Crypto deposits, crypto withdrawals, and crypto wallet funding (globally off).
- Live on-chain withdrawal signing (only an offline mock signer exists; selecting
  "live" throws).
- Real (paid) KYC/liveness and sanctions/PEP/adverse-media providers (mocks).
- Automated FIU filing (only masked draft assembly exists).

See `production-blockers.md` for the full list of items required before
production / real-money / live-crypto operation.
