# VAPT Scope & Rules of Engagement (Stage 8)

**Target: EXORA staging/demo. Mode: INR_ONLY. Crypto globally disabled.**

> This is the authoritative scope for an independent VAPT of EXORA staging. Read
> with [`stage-8-final-audit-readiness.md`](./stage-8-final-audit-readiness.md)
> and [`AUDIT_SCOPE.md`](./AUDIT_SCOPE.md).

---

## 1. In-scope targets

| Surface | URL |
|---|---|
| Frontend (user) | `https://www.exorain.com` |
| User API | `https://www.exorain.com/api/v1` |
| Admin API | `https://www.exorain.com/admin/v1` |
| Admin login | `https://www.exorain.com/admin/login` |

> Note: the admin API runs as a **separate process** and may be served on its own
> host/port behind VPN/IP-allowlist in some environments. If the `/admin/v1` path
> is not reachable at the www origin, request the correct admin base from the
> platform owner (do not scan for it).

## 2. Out-of-scope (do NOT perform)

- ❌ Destructive testing (data deletion, corruption, state teardown).
- ❌ DDoS / load / stress / volumetric attacks.
- ❌ Social engineering of staff or users.
- ❌ Phishing (email/SMS/voice).
- ❌ Physical attacks / facility access.
- ❌ AWS account / IAM takeover attempts (console, keys, role assumption, metadata).
- ❌ Real money-movement abuse (INR deposit/withdrawal fraud, chargebacks, payout manipulation).
- ❌ Crypto enablement (do not attempt to flip any `CRYPTO_*_GLOBAL_ENABLED`).
- ❌ Wallet / private-key / signer testing (no signing surface is exposed).
- ❌ Third-party providers (payment gateway, email, hosting) — test EXORA only.

Findings that *require* any out-of-scope action to demonstrate should be reported
as **theoretical** with a safe, non-destructive proof.

## 3. Safe test accounts

> **Placeholder only. Do NOT commit real passwords or tokens to Git.**
> Real credentials are handed over out of band (see
> [`AUDITOR_TEST_ACCOUNTS_TEMPLATE.md`](./AUDITOR_TEST_ACCOUNTS_TEMPLATE.md)).

| Role | Username/email | Password | 2FA | Notes |
|---|---|---|---|---|
| User A | `<user-a@example.test>` | `<provided-oob>` | `<oob>` | KYC-approved test user |
| User B | `<user-b@example.test>` | `<provided-oob>` | `<oob>` | For session-revocation test |
| Admin (read) | `<admin-ro@example.test>` | `<provided-oob>` | TOTP `<oob>` | Non-SUPER_ADMIN |
| SUPER_ADMIN | `<super@example.test>` | `<provided-oob>` | TOTP `<oob>` | Lifecycle actions |

## 4. Testing notes (expected behavior)

- **Login requires browser location permission** (`REQUIRE_LOGIN_LOCATION`).
  Denying location returns `LOCATION_REQUIRED` — this is expected, not a bug.
- **One active session per user.** Logging in from browser B revokes browser A's
  session (`SESSION_REVOKED_BY_NEW_LOGIN`). Old-session revocation is **expected**.
- **Crypto APIs should return blocked / 401 / 403 / feature-disabled** — never
  2xx data. A 2xx from a crypto endpoint is a reportable finding.
- **Admin APIs require admin auth + RBAC.** Unauthenticated or user-token requests
  must return **401/403**, never data. RBAC-restricted actions (e.g. deactivate)
  must be denied for non-SUPER_ADMIN.
- **Step-up auth** is required before INR withdrawal / sensitive change; a stale or
  missing step-up token must be rejected.
- **No fake/demo data** should appear in the UI (no `Rahul Verma`, `Mumbai`,
  `Active Devices 3`, `demo balance`, etc.). Report any that appear.

## 5. Reporting format

Each finding must include:

| Field | Content |
|---|---|
| **Severity** | Critical / High / Medium / Low / Info (CVSS optional) |
| **Affected URL** | Exact endpoint / page |
| **Reproduction** | Numbered, non-destructive steps |
| **Evidence screenshot** | Redacted; no real PII/secrets |
| **Impact** | What an attacker gains |
| **Recommendation** | Concrete fix |
| **Retest result** | Pass/fail after remediation |

Deliver as a single report plus per-finding evidence. Do not include real user
PII, secrets, tokens, or credentials in the report body — redact.

---

**No crypto enablement. No wallet/key testing. No destructive or infrastructure
takeover testing. Staging INR_ONLY.**
