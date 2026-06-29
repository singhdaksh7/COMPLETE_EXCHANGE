# Admin Endpoint Safe Checks (Stage 6)

**Status: AUDITOR CHECKLIST — staging/demo (INR_ONLY).**
Non-destructive, read-only checks an auditor can run to confirm admin-surface
controls. **No destructive tests, no brute force, no real credentials, no
exploitation.** Replace `<ADMIN_BASE>` with the admin API base (e.g.
`https://<admin-host>/admin/v1`) and `<API_BASE>` with `https://<api-host>/api/v1`.

> Run each check **once or twice** — do not hammer login endpoints (you may trip
> the brute-force lockout and skew results). The expected behaviors below are
> implemented in `backend/src/middleware/admin-authenticate.ts`,
> `admin-authorize.ts`, and `admin-rbac.service.ts`.

---

## 1. Unauthenticated admin endpoint → 401/403, never data

```bash
curl -sS -o /dev/null -w "%{http_code}\n" <ADMIN_BASE>/users          # expect 401
curl -sS -i <ADMIN_BASE>/users | head -5                              # expect error envelope, NOT user data
```
Liveness `GET <ADMIN_BASE>/ping` may return `200 {surface:"admin"}` by design —
that is a health ping, not privileged data.

## 2. Admin login rate-limits / locks out

- Confirm the login route returns `429 RATE_LIMITED` after the configured number
  of rapid attempts (don't exceed it — a couple over the line is enough to
  demonstrate). Repeated failures for one account also trigger lockout
  (`auth.login_locked` in `admin_logs`).
- **Do not** run a sustained brute-force; one short burst demonstrates the
  control.

## 3. Admin APIs require a Bearer admin token / valid session

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer not-a-real-token" <ADMIN_BASE>/users  # expect 401
```
A missing/malformed `Authorization` header is rejected before any handler.

## 4. A non-admin USER token must NOT access admin APIs

- Obtain a normal user access token (test account) and call an admin route:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <USER_ACCESS_TOKEN>" <ADMIN_BASE>/users  # expect 401/403
```
User tokens are verified by the **admin** verifier (`verifyAdminAccessToken`) and
session validator — a user token is not a valid admin session.

## 5. Per-admin IP allowlist

- From an IP **not** on an admin's allowlist, an otherwise-valid admin token
  returns `403 IP_NOT_ALLOWED` (enforced on every request, not just login).
  Demonstrate only if a non-allowlisted vantage point is available; otherwise
  note the control is code-enforced (`isIpAllowed`).

## 6. Admin actions generate audit logs

- After a benign admin read/action with a valid admin session, confirm a row in
  `admin_logs` (append-only). Verify the table rejects UPDATE/DELETE (DB trigger)
  — a SELECT is sufficient; do not attempt to mutate it.

## 7. Admin 2FA (TOTP) is required

- Confirm admin login requires a TOTP step (in production a TOTP-less admin is
  blocked: `adminTotpRequired`). In staging the explicit
  `ALLOW_ADMIN_LOGIN_WITHOUT_TOTP` override may relax this for bootstrap — note
  whether it is set (it should be off for the audit demo where feasible).

## 8. Sensitive admin actions require appropriate RBAC

- With a low-privilege admin (e.g. READ_ONLY / SUPPORT) token, a privileged
  mutation route (e.g. user lock, withdrawal approve) must return `403`
  (`adminAuthorize('<permission>')`). Demonstrate with a read-only role token;
  do not actually approve/reject real items.

## 9. Security headers present on admin/API responses

```bash
curl -sS -I <ADMIN_BASE>/ping | grep -iE 'strict-transport|x-content-type|x-frame|referrer|permissions-policy'
```
Expect helmet headers + `Permissions-Policy` (`backend/src/middleware/security.ts`).

---

## Guardrails for the auditor

- **Read-only / minimal**: one or two requests per check; no load testing.
- **No brute force / no lockout farming**: a single short burst to show the
  limiter, then stop.
- **No real credentials** beyond the provided test accounts; never use
  production admin credentials.
- **No exploitation / no destructive mutations**: do not approve/reject real
  money movement, do not lock real users, do not modify audit rows.
- Capture HTTP status codes + headers as evidence; attach to the evidence pack.
