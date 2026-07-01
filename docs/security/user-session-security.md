# User Session Security (Stage 7B)

**Status: OPERATIONAL / AUDIT-READINESS — staging/demo (INR_ONLY).**
Covers the single active session policy, previous-session revocation, and the
consented login-location signal for **user** accounts. Admin sessions are out of
scope here (admins keep multi-session; see `admin-access-runbook.md`).

Backend: `backend/src/modules/auth/*` + `middleware/authenticate.ts`.
Frontend: `frontend/app/login/page.tsx`, `app/security/page.tsx`,
`app/settings/page.tsx`, `app/profile/page.tsx`.

---

## 1. Single active session (one device at a time)

- Every successful user login (**password**, **password + 2FA**, and
  **email-OTP**) routes through `authService.issueSession`, which — after
  creating the new session — revokes **every other active session** for that
  user (`enforceSingleActiveSession`). Only the newest session stays valid.
- Revoked sessions are added to the Redis denylist with the value `NEW_LOGIN`.
  On its next request the old access token is rejected by the authenticate
  middleware with:
  - HTTP 401, code **`SESSION_REVOKED_BY_NEW_LOGIN`**
  - message: *"Your session was signed out because your account was opened on
    another device."*
- A `USER_PREVIOUS_SESSION_REVOKED` (`auth.previous_session_revoked`) audit event
  records the userId, the new session id, and the previous session id(s) with
  their IP / user-agent / (approx) location — old and new — for traceability.
- Enforcement is **best-effort around the login**: a failure to revoke never
  fails the login itself (the new session is still the only valid one because
  the old token is denylisted; the DB revoke is the durable authority).

**Why revocation, not a token version counter:** the platform already has a
durable session store (DB `auth_sessions` + Redis denylist) with instant
revocation, so a new login simply revokes prior sessions. A separate
`sessionVersion`/`tokenVersion` column is therefore **not needed**. Refresh
tokens are covered too: a revoked session's `revokedAt` is set, so refresh
rotation for an old session is rejected (and reuse of a rotated token revokes
the whole family).

## 2. Login location (consented, approximate, audit-only)

- The login screen requests browser geolocation **before** sign-in. If granted,
  latitude/longitude/accuracy are sent to the login API and stored — reduced to
  ~3-decimal precision (~110 m) — on the session (`deviceInfo.location`) and in
  the `auth.login` audit metadata. The user sees their own session location on
  the Security Center.
- **We never invent a location.** No reverse geocoding, no city/state/country is
  derived, and there is **no fallback to a fake/default city** (e.g. no
  auto-filled Mumbai/Maharashtra). The UI shows approximate coordinates or
  "not captured".
- **Enforcement flag `REQUIRE_LOGIN_LOCATION`** (backend, default `false`):
  - When `true`, the login/2FA/OTP APIs reject a missing/invalid location with
    HTTP 400 code **`LOCATION_REQUIRED`** *before* issuing any session or 2FA
    challenge.
  - The frontend mirrors this with `NEXT_PUBLIC_REQUIRE_LOGIN_LOCATION`: when on,
    the login button is blocked until permission is granted, with clear copy and
    a retry (`LOCATION_UNSUPPORTED` state for browsers without geolocation).
  - **Default is safe**: both default off, so no user is locked out by a browser
    that blocks location. Staging may opt in.

### Error codes

| Code | Where | Meaning |
|---|---|---|
| `SESSION_REVOKED_BY_NEW_LOGIN` | authenticate middleware (401) | Session ended by a newer login on another device. |
| `LOCATION_REQUIRED` | login / 2FA / OTP (400) | `REQUIRE_LOGIN_LOCATION=true` and no valid location payload. |
| `LOCATION_UNSUPPORTED` | frontend only | Browser has no geolocation API (blocks login when required). |

## 3. Real alerts only (no fake data)

- User-facing alerts come **only** from real backend events: the `Notification`
  table (KYC decisions, INR deposit submitted/approved/rejected, INR withdrawal
  requested/rejected/**paid**, password change, session revoked) surfaced at
  `/notifications` and the Settings notifications feed, plus the append-only
  `AuditLog` feed on the Security Center (login, new device, previous-session
  revoked, 2FA events, …).
- INR withdrawal **marked paid** now emits a real `INR_WITHDRAWAL_PAID`
  notification (correct INR bank-payout copy, not the on-chain
  `WITHDRAWAL_COMPLETED` copy).
- All previously hardcoded/mock rows were removed: no fake login "New Delhi",
  no fake deposits/withdrawals, no crypto rows (INR_ONLY), no fake devices
  ("3 Devices"), no fake city/state. Empty states read **"No alerts yet."** and
  the active-device count is derived from real sessions (1 under this policy).

## 4. Privacy & limitations

- Stored location is reduced precision (rounded lat/lng, coarse accuracy,
  timestamp) plus the user-agent and the IP already captured. A user can see
  **their own** login/session locations; they are never exposed to other users.
- **Browser geolocation is user-consented and NOT fraud-proof** — it can be
  denied, coarse, or spoofed (VPN/emulator). Treat it as a security/audit
  signal, not an identity or anti-fraud control.
- **Mobile:** there is no separate mobile app session/security screen in this
  repo; the same rules apply wherever the web login runs. No fake mobile
  session/location data is shown. (Documented mobile limitation.)
- **Email-OTP login** captures location best-effort but does not hard-block on
  denial in its own form; when `REQUIRE_LOGIN_LOCATION=true` the backend still
  rejects an OTP login without a location. Prefer password login in strict mode.
- Idle-session timeout remains a separate platform gap (absolute expiry exists).
