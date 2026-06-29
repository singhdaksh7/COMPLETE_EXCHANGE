# User 2FA / MFA + Step-up Authentication

**Status: implemented (staging/demo, INR_ONLY).** Closes production blockers #1
(User 2FA/MFA) and #2 (Step-up auth before withdrawal / address change) in
`docs/compliance/production-blockers.md`.

This document describes the user-facing authenticator (TOTP) second factor,
one-time backup codes, login enforcement, step-up re-authentication for
sensitive actions, and admin support tooling.

---

## 1. Threat model / goals

- A stolen password alone must not grant account access (login 2FA).
- A hijacked *session* must not be enough to move money or change payout details
  / withdrawal allowlists (step-up re-auth with a fresh factor).
- Secrets are never stored in plaintext and never logged.
- Backup codes survive loss of the authenticator but are one-time and hashed.

Crypto remains globally disabled (INR_ONLY). Step-up was added to the crypto
withdrawal/address routes too, but those stay behind their feature gate — this
change does **not** enable crypto and does **not** alter any ledger, payout
lifecycle, matching, or INR approval logic.

---

## 2. Cryptography

- **TOTP** — RFC 6238, SHA-1, 30-second period, 6 digits, base32 secret
  (160-bit). Verification accepts ±1 step of clock skew and uses a
  constant-time comparison (`crypto.timingSafeEqual`). Pure util:
  `backend/src/lib/totp.ts`.
- **Secret at rest** — the user's TOTP secret is sealed with AES-256-GCM via
  `lib/encryption.ts` (`encryptPII`/`decryptPII`) and stored in
  `User.totpSecretEnc Bytes?`. The plaintext secret is returned to the client
  **once** at setup and never again.
- **Backup codes** — 10 codes, format `XXXXX-XXXXX` (ambiguous characters
  I/O/0/1 excluded). Only a SHA-256 hash is stored (`TotpRecoveryCode.codeHash`);
  the plaintext set is shown once at generation. Each code is single-use
  (atomic `updateMany` on `usedAt IS NULL`).

No migration was required: `User.totpSecretEnc`, `User.totpEnabled`, and the
`TotpRecoveryCode` model already exist in the applied freeze migration
`20260612120000_full_architecture_freeze`.

---

## 3. Backend surface

Module: `backend/src/modules/user-security/` mounted at `/api/v1/security`.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /security/2fa/status` | session | `{ enabled, backupCodesRemaining }` — never returns the secret. |
| `POST /security/2fa/setup` | session | Generates + seals a secret; returns `{ secret, otpauthUri }` once. Does **not** enable. Audit: `user.2fa_setup_started`. |
| `POST /security/2fa/confirm` | session | Verifies a code, enables 2FA, generates backup codes (returned once). Audit: `user.2fa_enabled`. |
| `POST /security/2fa/disable` | session | Requires password (Argon2id verify) **and** a current factor. Audit: `user.2fa_disable_failed` / `user.2fa_disabled`. |
| `POST /security/2fa/backup-codes/regenerate` | session | Requires a current factor; voids old codes, returns new set once. Audit: `user.backup_codes_regenerated`. |
| `POST /security/step-up` | session | Verifies a fresh factor (TOTP/backup if 2FA on, else password) → short-lived step-up token. |
| `POST /auth/2fa/verify` | challenge token | Second step of a 2FA-gated login. Audit: `user.2fa_login_success` / `user.2fa_login_failed`. |

Verification endpoints additionally carry the auth rate-limiter.

### Login enforcement

`auth.service.login` returns a discriminated result:

- 2FA off → normal `{ user, tokens }`.
- 2FA on → `{ twoFactorRequired: true, challengeToken, methods }` and audits
  `user.2fa_login_required`. **No session/tokens are issued.** The short-lived
  (5-min), single-use challenge token is stored hashed in Redis
  (`auth:2fa:challenge:<sha256>`, consumed with `GETDEL`). The client then calls
  `/auth/2fa/verify` with the challenge token + a TOTP or backup code; only on
  success are real tokens minted.

### Rate limiting

Second-factor verification is counted per user in Redis (`2fa:fail:<userId>`,
5 fails / 15-min window) in addition to the IP/route auth rate-limiter. Failures
are audited; secrets and codes are never logged.

---

## 4. Step-up re-authentication

Middleware: `backend/src/middleware/require-step-up.ts` (`requireStepUp()`),
mounted **after** `authenticate` on sensitive routes:

- INR withdrawal create — `inr-withdrawal.routes.ts` (after the
  `canWithdrawInr` feature gate, before idempotency/controller).
- Crypto withdrawal create + withdrawal-address add — `withdrawal.routes.ts`
  (still behind the crypto feature gate).
- Disabling 2FA and regenerating backup codes already require a fresh factor
  inline.

Flow: the client first calls `POST /security/step-up` with the appropriate
factor to obtain a token (valid 5 min, stored hashed in Redis
`auth:stepup:<sha256>`), then replays the sensitive request with the
`X-Step-Up-Token` header. Missing/invalid token →
`401 STEP_UP_REQUIRED`. The middleware only *gates acceptance* of the request;
it does not touch accounting, reservation, or payout lifecycle.

---

## 5. Admin support (3C)

- New permission **`users.security.manage`** (`admin-rbac.baseline.ts`), granted
  to COMPLIANCE_OFFICER; SUPER_ADMIN bypasses as usual; last-super-admin rules
  unchanged.
- `GET /admin/users/:userId/2fa` — view whether a user has 2FA enabled (never
  the secret/backup codes). Audit: `admin.user_2fa_status_viewed`.
- `POST /admin/users/:userId/2fa/reset` — disable/reset a user's 2FA for account
  recovery. Writes an `admin_logs` entry. Audit: `admin.user_2fa_reset`.

A normal admin without the permission receives `403` (covered by tests).

---

## 6. Audit events

`user.2fa_setup_started`, `user.2fa_enabled`, `user.2fa_disable_failed`,
`user.2fa_disabled`, `user.2fa_login_required`, `user.2fa_login_success`,
`user.2fa_login_failed`, `user.backup_code_used`,
`user.backup_codes_regenerated`, `user.step_up_verified`,
`user.step_up_failed`, `admin.user_2fa_reset`, `admin.user_2fa_status_viewed`
(`backend/src/lib/audit.ts`). Secrets and backup codes are never included.

---

## 7. Frontend (web) and mobile

**Web** (`frontend/`):
- `app/security/page.tsx` — real 2FA status, setup (manual-entry key + otpauth
  URI), confirm, one-time backup-code reveal, regenerate, disable.
- `app/login/page.tsx` — handles the `2FA_REQUIRED` challenge with a TOTP/backup
  card; no fake "enabled" state.
- `app/inr-withdraw/page.tsx` — step-up prompt before submit; the verified token
  is sent on the withdrawal request.

**Mobile** (`mobile/`):
- `src/screens/SecurityScreen.tsx` — same 2FA management UI (premium black/gold).
- `src/screens/LoginScreen.tsx` + `src/store/auth.tsx` — 2FA challenge step.
- `src/screens/WithdrawScreen.tsx` — step-up prompt before INR payout request.

The QR is presented as the **manual-entry secret + otpauth URI** rather than a
rendered image, so the secret is never sent to any third-party QR service.

---

## 8. Tests

- `backend/test/unit/totp.test.ts` — TOTP generation/verification, skew,
  rejection of malformed codes.
- `backend/test/unit/user-security-service.test.ts` — setup/confirm/disable,
  backup-code hashing + one-time use, rate-limit lock, login challenge, step-up.
- `backend/test/unit/step-up-middleware.test.ts` — gate allows/denies correctly.
- `backend/test/unit/admin-user-2fa-routes.test.ts` — permission gating (403
  without `users.security.manage`).
- `backend/test/unit/auth-service.test.ts` — 2FA-challenge login branch.

Web `npm run build`, mobile `npx tsc --noEmit` + `npx expo lint` all pass.

---

## 9. Limitations (still staging/demo)

- Redis-backed ephemeral tokens assume a single trusted Redis; production should
  use the managed/secrets-managed instance (blocker #9).
- No WebAuthn / passkeys yet (TOTP + backup codes only).
- Biometric unlock on mobile is **not** implemented (honestly labelled
  "coming soon", not a fake enabled state).
- SMS/voice fallback intentionally omitted (phishing/SIM-swap risk).
