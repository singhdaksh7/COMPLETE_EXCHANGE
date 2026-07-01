# Auth Hardening Checklist (Stage 8A)

**Mode: INR_ONLY staging/demo. Crypto globally disabled. Custom auth (no managed
provider).**

> Audit of EXORA's authentication surface for cybersecurity audit readiness, plus
> the small safe fixes applied in Stage 8A. Status values:
> ✅ implemented · 🔎 verified this stage · 🟡 partially implemented ·
> ⏭️ future · N/A not applicable.

Evidence key: `code` = source; `test` = backend test; `doc` = referenced markdown.

---

## Control status

| # | Control | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | **Server-side schema validation** (all auth endpoints, Zod, `.strict()`) | ✅ 🔎 | `auth.validators.ts`, `auth.otp.validators.ts`, `kyc.validators.ts` | Email trim/lowercase/format; password policy; unknown keys rejected. Never relies on frontend validation. |
| 2 | **Input sanitization** (identity/free-text display fields) | ✅ 🔎 | `kyc.validators.ts` (`noAngleBrackets`), `test/unit/kyc-validators.test.ts` | Stage 8A: reject `<`/`>` in KYC `fullName`/address/`city`/`state` + decision `reason`/`complianceNote`/`note`. React escapes on render (defense in depth). |
| 3 | **Secure password hashing** (Argon2id) | ✅ 🔎 | `auth.service.ts` (`@node-rs/argon2`, `ARGON_OPTS`) | Argon2id, per-hash salt via lib, constant-time `verify`. No plaintext storage. No bcrypt migration needed. |
| 4 | **Max password length (hashing-DoS guard)** | ✅ 🔎 | `auth.validators.ts` (`loginSchema`), `test/unit/auth-validators.test.ts` | Stage 8A: login password capped at 128 (was min-only), matching the registration policy. Body limit also bounds size. |
| 5 | **Passwords never logged** | ✅ 🔎 | audit calls log `{ email }` only; controllers pass password into service args, not loggers | Verified by search — no `log.*password` / `console.log(password)`; not in audit metadata. |
| 6 | **Generic auth errors (no enumeration)** — login | ✅ 🔎 | `auth.service.ts` login; `test/unit/auth-service.test.ts` (`INVALID_CREDENTIALS`) | Same code+message for unknown-email vs wrong-password. Stage 8A copy: "Incorrect email or password." Dummy Argon2id verify runs when user is absent (timing parity). |
| 7 | **Password-reset non-enumeration** | ✅ 🔎 | `auth.service.ts` `forgotPassword` (returns void), `auth.controller.ts` (`{ sent: true }`) | Always generic; never reveals whether the email is registered. Frontend copy: "If that email is registered, you will receive reset instructions." |
| 8 | **Resend-verification non-enumeration** | ✅ | `auth.controller.ts` `resendVerification` (`{ sent: true }`) | Generic response regardless of account existence. |
| 9 | **OTP login non-enumeration + throttling** | ✅ | `auth.otp.service.ts`, `auth.otp.validators.ts`, `test/unit/auth-otp-service.test.ts` | Server derives LOGIN vs SIGNUP; generic result; send/verify rate-limited. |
| 10 | **Rate limiting** (global + auth) | ✅ | `middleware/rate-limit.ts` (Redis-backed), `app.ts` | `AUTH_RATE_LIMIT_MAX` on auth routes; global limiter mounted app-wide. |
| 11 | **Login lockout** (pair / email / IP dimensions) | ✅ | `auth.service.ts` (`LOCKOUT_*_MULTIPLIER`, `ACCOUNT_LOCKED`) | Generic `ACCOUNT_LOCKED` (429); does not reveal whether the email is a real account. |
| 12 | **Admin login lockout + TOTP** | ✅ | `admin-authenticate.ts`, `admin-access-runbook.md` | Admin TOTP encrypted at rest; admin lockout from prior stages. |
| 13 | **2FA verify throttling** | ✅ | `auth.service.ts` verify2fa; security service challenge tokens | Short-lived single-purpose challenge token; rate-limited verify. |
| 14 | **Single active session revocation** | ✅ | `user-session-security.md`, `auth.service.ts` | Previous session revoked (`SESSION_REVOKED_BY_NEW_LOGIN`). |
| 15 | **Login location requirement** | ✅ | `user-session-security.md`, `loginLocation` schema | Consented, precision-reduced; `LOCATION_REQUIRED` when denied. Not weakened. |
| 16 | **Malformed JSON → safe 400** | ✅ 🔎 | `middleware/error-handler.ts` (`isBodyParseError`), `test/unit/error-handler-json.test.ts` | Stage 8A fix: was 500; now `400 INVALID_JSON` "Invalid JSON body." — no raw body / stack leaked. |
| 17 | **Intentional security errors preserved** | ✅ 🔎 | `auth.service.ts` | `LOCATION_REQUIRED`, `2FA_REQUIRED`, `SESSION_REVOKED_BY_NEW_LOGIN`, `KYC_REQUIRED`, `EMAIL_NOT_VERIFIED` unchanged (post-password states, not enumeration by guessing). |
| 18 | **Registration email-existence response** | 🟡 | `auth.service.ts` `register` (`EMAIL_TAKEN` 409) | Registration still signals an email is taken (standard UX). Non-enumerating signup (always "check your email") is a larger UX change — tracked as a future option, low risk on staging. |
| 19 | **Managed auth provider (Clerk/Auth0/Supabase)** | ⏭️ | `production-blockers.md`, `stage-8-final-audit-readiness.md` | **Not integrated. Out of scope now.** Migration is a future architectural option; migrating before the audit freeze is high risk. Custom controls above are retained for staging audit. |
| 20 | **CAPTCHA / bot mitigation** | ⏭️ | this doc | Optional future integration; **not implemented** (no paid vendor added). Rate limits + lockouts are the current control. |
| 21 | **Progressive login delay** | ⏭️ | this doc | Not implemented; lockout + rate limit cover the risk today. Future optional. |

## Stage 8A changes (this stage)

| File | Change |
|---|---|
| `backend/src/middleware/error-handler.ts` | Added `isBodyParseError` branch → malformed JSON returns `400 INVALID_JSON` "Invalid JSON body." instead of 500. |
| `backend/src/modules/auth/auth.validators.ts` | `loginSchema.password` gains `.max(128)` (hashing-DoS guard, matches registration). |
| `backend/src/modules/auth/auth.service.ts` | Login failure message → "Incorrect email or password." (code `INVALID_CREDENTIALS` unchanged; behavior already non-enumerating). |
| `backend/src/modules/kyc/kyc.validators.ts` | `noAngleBrackets` rejects `<`/`>` in `fullName`, address lines, `city`, `state`, decision `reason`/`complianceNote`, standalone `note`. |
| `backend/test/unit/error-handler-json.test.ts` | New: malformed-JSON regression (400, no leak, valid JSON still 200). |
| `backend/test/unit/auth-validators.test.ts` | New: over-long login password rejected; 128 accepted. |
| `backend/test/unit/kyc-validators.test.ts` | New: HTML/script rejected in identity/address/reason/note; legit punctuation still accepted. |

## Not changed (already strong — do not duplicate)

- Argon2id hashing + dummy-hash timing defense, Redis-backed rate limits, user
  2FA, withdrawal step-up, admin TOTP + lockout, single-session revocation,
  login-location requirement. These are audited above and left as-is.

## Remaining auth gaps / future

- Non-enumerating registration (#18) — future UX change, low risk on staging.
- Managed auth provider (#19), CAPTCHA (#20), progressive delay (#21) — future,
  optional; **out of scope for the audit freeze**.
- See [`../compliance/production-blockers.md`](../compliance/production-blockers.md).

---

**No managed-provider migration, no crypto, no money-movement or ledger changes
were made. This is a staging auth hardening pass, not a production certification.**
