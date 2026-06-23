# EXORA — Auditor Test Accounts (TEMPLATE)

**Stage:** 7.0B/7.0C · **Environment:** STAGING only · **Last updated:** 2026-06-23

> ⚠️ **DO NOT COMMIT REAL CREDENTIALS.** This is a template. Fill it in a secure,
> out-of-band document (password manager / encrypted share) and deliver it to
> the auditor privately. Never put real passwords, TOTP seeds, tokens, or secrets
> in Git, tickets, email, or chat. Use unique, throwaway credentials and rotate /
> disable them after the engagement.

---

## Provisioning notes
- Create these on **staging only**, against the staging API.
- For each **admin** account, add the auditor's source IP(s) to that account's
  **IP allowlist** (admin access is rejected from non-allowlisted IPs on every
  request — `src/middleware/admin-authenticate.ts`).
- Admin RBAC roles are seeded by `ensureAdminRbacBaseline`
  (`SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`, `READ_ONLY`).
- If TOTP is enforced for the engagement, enroll TOTP per account and share the
  enrollment QR/seed out of band (see TOTP section).

---

## 1. Standard user account
| Field | Value |
|-------|-------|
| Email | `<auditor-user@example.test>` |
| Password | `<set out of band>` |
| KYC tier / state | `<e.g. Tier 2 approved>` |
| Funded (testnet/mock balance) | `<yes/no — amounts>` |
| Purpose | User-facing flows, horizontal IDOR, money-movement validation |

## 2. Admin — SUPER_ADMIN
| Field | Value |
|-------|-------|
| Email | `<auditor-superadmin@example.test>` |
| Password | `<set out of band>` |
| Role | SUPER_ADMIN (bypasses permission checks; can decide maker-checker) |
| IP allowlist | `<auditor source IP/CIDR>` |
| TOTP | `<see TOTP section>` |

## 3. Admin — KYC_REVIEWER
| Field | Value |
|-------|-------|
| Email | `<auditor-kyc@example.test>` |
| Password | `<set out of band>` |
| Role | KYC_REVIEWER (compliance maker; **cannot** decide approvals or manage AML policy) |
| IP allowlist | `<auditor source IP/CIDR>` |
| Purpose | Maker-checker separation tests, compliance flows |

## 4. Admin — FINANCE
| Field | Value |
|-------|-------|
| Email | `<auditor-finance@example.test>` |
| Password | `<set out of band>` |
| Role | FINANCE (INR/withdrawals/ledger; **no** AML policy/approval management) |
| IP allowlist | `<auditor source IP/CIDR>` |
| Purpose | Vertical privilege-boundary tests vs AML/compliance |

## 5. Admin — READ_ONLY (auditor / read-only)
| Field | Value |
|-------|-------|
| Email | `<auditor-readonly@example.test>` |
| Password | `<set out of band>` |
| Role | READ_ONLY (`.view` permissions only) |
| IP allowlist | `<auditor source IP/CIDR>` |
| Purpose | Confirm no mutating action is possible from a view-only role |

## 6. (Optional) Admin — SUPPORT
| Field | Value |
|-------|-------|
| Email | `<auditor-support@example.test>` |
| Password | `<set out of band>` |
| Role | SUPPORT (read-only across modules) |

---

## TOTP / OTP instructions (placeholder)
- **Admin TOTP:** if enforced, enroll each admin (RFC 6238 TOTP, e.g. Google
  Authenticator). Share the enrollment **seed/QR out of band**; never paste a
  TOTP secret here.
- **Email OTP / verification:** staging may log mail instead of sending
  (`MAIL_PROVIDER`/`ALLOW_LOG_MAIL_PROVIDER`). Provide the auditor a way to
  retrieve OTP/verification codes (e.g. a staging mailbox or log access) **out
  of band**.
- **Staging relaxations to disclose:** `ALLOW_UNVERIFIED_EMAIL_LOGIN`,
  `ALLOW_ADMIN_LOGIN_WITHOUT_TOTP` may be enabled in staging — confirm current
  values with engineering so the auditor tests the intended configuration.

---

## Post-engagement
- [ ] Disable / delete all auditor accounts.
- [ ] Remove auditor IPs from admin allowlists.
- [ ] Rotate any shared staging secrets if exposed during testing.
- [ ] Revoke all active sessions for the test accounts.
