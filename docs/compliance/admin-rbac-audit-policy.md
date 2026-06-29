# Admin RBAC & Audit Policy

**Mode: INR_ONLY staging/demo.** Describes the admin access-control and audit
model as implemented. Production-edge controls (WAF, private admin network) are
tracked separately as blockers.

---

## 1. Admin authentication

- Admins authenticate on a **separate auth surface** with distinct token
  audiences from users; normal user tokens cannot access admin APIs.
  Evidence: `backend/src/middleware/admin-authenticate.ts`,
  `backend/src/lib/jwt.ts` (admin audiences).
- **MFA (TOTP)** is verified at admin login; in real production a TOTP-less admin
  is blocked from logging in. The TOTP secret is **encrypted at rest**
  (AES-256-GCM).
  Evidence: `backend/src/modules/admin-rbac/admin-rbac.service.ts`
  (`login`, `sealTotpSecret`, `verifyTotp`).
- **Brute-force lockout** (Redis, per email+IP) protects admin login.
- **Per-admin IP allowlist** is enforced on **every** admin request (not just
  login).
  Evidence: `admin-authenticate.ts`, `backend/src/lib/ip-allowlist.ts`.

## 2. Admin roles & RBAC

- Role-based access control with an `ADMIN` baseline of roles/permissions;
  `SUPER_ADMIN` bypasses individual permission checks.
  Evidence: `backend/src/middleware/admin-authorize.ts`
  (`adminAuthorize`, `adminAuthorizeAny`),
  `backend/src/modules/admin-rbac/admin-rbac.baseline.ts`.
- Each admin is an individual account (no shared admin accounts) created with a
  single non-SUPER_ADMIN role and an individual initial password and TOTP
  enrollment.
  Evidence: `admin-rbac.service.ts` (`createAdmin`).

## 3. Sensitive permissions & protections

- **Last-super-admin protection:** the system refuses to remove the SUPER_ADMIN
  role from, or suspend, the last active super admin.
- **Self-action guard:** an admin cannot change their own status.
- **SUPER_ADMIN-protected permissions** cannot be revoked from the role.
  Evidence: `admin-rbac.service.ts` (`removeRoleFromAdmin`,
  `updateAdminStatus`, `revokePermissionFromRole`).
- Sensitive admin mutations are additionally throttled
  (`adminSensitiveRateLimiter`).

## 4. Maker-checker controls

- **INR manual deposits** at/above a threshold require **two different admins**
  (first approval records state; the same admin cannot give the second
  approval).
  Evidence: `backend/src/modules/deposit/deposit.service.ts`
  (`approveManualDeposit`, `SAME_APPROVER`).
- The crypto withdrawal dual-approval path exists in code but is **inactive in
  INR_ONLY** (crypto disabled).

## 5. Feature controls

- Admins manage per-user feature controls (INR/trading/crypto/restrictions)
  above the global INR_ONLY switches. Changes record old/new values + reason.
  Evidence: `backend/src/modules/feature-controls/feature-controls.service.ts`.
  See `inr-only-mode.md`.

## 6. Audit logs

- Every admin action is written to **both** the append-only `audit_logs` and the
  `admin_logs` trail, with actor, target, before/after (where relevant), reason,
  IP, and request id. UPDATE/DELETE are rejected by DB trigger.
  Evidence: `backend/src/lib/audit.ts`, admin module `writeAdminLog` calls,
  append-only migration triggers.
- **Note:** `audit_logs.prev_hash` / `row_hash` columns are **reserved** for a
  future tamper-evident hash chain and are **not yet populated** — append-only
  enforcement is the current integrity control. (Accurately reflected in the
  schema comments.)

## 7. Production requirements (not implemented in staging)

- Admin **network isolation** / private admin edge + **WAF**.
- Centralized **SIEM alerting** for admin-risk actions.
- Admin **idle/session timeout** (absolute expiry exists; idle timeout does not).

Tracked in `production-blockers.md`.
