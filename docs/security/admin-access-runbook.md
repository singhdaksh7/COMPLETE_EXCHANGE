# Admin Access Runbook (Stage 6)

**Status: OPERATIONAL RUNBOOK — staging/demo (INR_ONLY).**
Who may hold admin access, how it is controlled, and how to respond to admin
access incidents. Pairs with `admin-edge-security-readiness.md`,
`admin-endpoint-safe-checks.md`, and `cert-in-incident-response.md`.

Admin API: separate process, prefix `/admin/v1`, per-admin IP allowlist + Bearer
+ RBAC + TOTP (`backend/src/middleware/admin-authenticate.ts`,
`admin-authorize.ts`, `admin-rbac.service.ts`).

---

## 1. Who should have admin access

- Only named staff with a documented business need. No shared/generic admin
  accounts. Each admin maps to one real person.
- Access is **role-scoped** (RBAC): SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT,
  READ_ONLY (and per-permission grants). Grant the least role that does the job.
- A register of current admins + roles + owning manager is kept out-of-band
  (not in Git).

## 2. Admin MFA / 2FA requirement

- **TOTP 2FA is required** for admins. In real production a TOTP-less admin is
  blocked from login (`adminTotpRequired`, `prod-safety.ts`); the only escape is
  the explicit `ALLOW_ADMIN_LOGIN_WITHOUT_TOTP` **staging** override used to
  bootstrap the first admin.
- TOTP secrets are encrypted at rest (`sealTotpSecret`). New admins enroll TOTP
  before being granted privileged permissions.

## 3. Emergency (break-glass) admin access

- Use a pre-designated SUPER_ADMIN break-glass account; its use is logged in
  `admin_logs` and must be reviewed afterward.
- Break-glass over a one-off allowlisted IP; remove the temporary IP after use.
- Record who, when (UTC+IST), why, and what actions were taken; file with the
  incident record.
- Never disable TOTP/RBAC/IP-allowlist to "get in faster" — add a temporary
  allowlist entry instead, then revert.

## 4. Admin lockout handling

- Admin login lockout is Redis-backed brute-force protection
  (`admin-rbac.service.ts`) plus `authRateLimiter` on the login route.
- A locked-out legitimate admin waits out the window, or another SUPER_ADMIN
  resets state. Do **not** raise limits globally to clear one lockout.
- Investigate the cause: repeated failures may indicate a brute-force attempt —
  check `admin_logs` for `auth.login_failed` / `auth.login_locked`.

## 5. Admin IP allowlist / VPN

- Each admin has a per-admin IP allowlist enforced on **every** request
  (`isIpAllowed`), so a stolen token cannot be replayed from a new IP.
- Keep allowlists tight (office/VPN egress). Review on staff change.
- Optional future: edge IP allowlist (WAF IP set) and/or VPN/bastion/Zero-Trust
  ingress for the admin panel — see `waf-readiness-plan.md` §3 (not enforced
  yet; an audit-readiness gap).

## 6. Admin session review

- Sessions are server-validated (`validateAdminSession`); suspend an admin to
  revoke all their sessions (`revokeAllAdminSessions`).
- Absolute session expiry exists; **idle timeout is a known gap** (blocker).
- Periodically review active admin sessions and recent logins via the admin
  security/operations dashboards.

## 7. Admin RBAC review

- Quarterly (and on every staff change) review each admin's role/permissions for
  least privilege. Remove unused permissions.
- Verify last-super-admin and self-action guards remain in force (cannot remove
  the final SUPER_ADMIN or self-demote dangerously).

## 8. Admin action audit review

- All privileged actions write append-only `admin_logs` (DB trigger blocks
  UPDATE/DELETE). Review high-risk actions (user lock/unlock, withdrawal
  approve/reject, feature-control changes, KYC decisions) regularly.
- Pivot on `requestId`; reconcile maker-checker pairs (different approver for
  sensitive approvals).

## 9. Offboarding an admin

1. Suspend the admin account immediately (revokes sessions).
2. Remove RBAC roles/permissions; clear their IP allowlist.
3. Confirm no break-glass credential is shared with them.
4. Record the offboarding in `admin_logs` review notes; verify no orphaned
   access remains.

## 10. Suspected admin account compromise

1. **Contain:** suspend the admin (revoke all sessions), tighten/clear their IP
   allowlist, rotate any credential they could have touched.
2. **Assess:** review `admin_logs` for their actions since suspected compromise;
   identify any sensitive mutations (approvals, user changes).
3. **Rotate:** if signing/secret exposure is possible, follow
   `secrets-rotation-runbook.md` (e.g. `JWT_*`) and revoke sessions platform-wide.
4. **Report:** treat as an incident — `cert-in-incident-response.md` (6-hour
   clock if reportable). Preserve logs; do not delete audit rows.
5. **Recover:** re-enroll the admin with a fresh TOTP and new credentials only
   after the investigation; review what RBAC they truly need.

---

**Do not** disable admin auth/RBAC/TOTP/IP-allowlist, enable crypto, or bypass
controls during any admin incident. Prefer config-only containment (suspend,
allowlist, rotate, revoke).
