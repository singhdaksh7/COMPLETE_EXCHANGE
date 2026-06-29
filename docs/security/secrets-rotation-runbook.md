# Secrets Rotation Runbook (Stage 5)

**Status: OPERATIONAL RUNBOOK — staging/demo (INR_ONLY).**
How to rotate each EXORA secret safely, the blast radius of each rotation, and
how to avoid logging users / admins out unnecessarily. Pair with
`docs/security/secret-inventory.md` and `docs/security/kms-readiness.md`.

Region `ap-south-1`. **Never** `get-secret-value` and **never** paste a secret
value into a terminal, ticket, or this doc. Rotate by generating a new value
inside Secrets Manager (or a one-liner that pipes straight in) and redeploying.

---

## 0. General procedure (applies to every secret)

1. Generate a strong value out-of-band (e.g. `openssl rand -base64 48`); pipe it
   into Secrets Manager — do not echo it:
   ```bash
   aws secretsmanager put-secret-value --secret-id <name> \
     --secret-string "$(openssl rand -base64 48)" --region ap-south-1
   ```
2. Roll the tasks so they pick up the new value:
   ```bash
   aws ecs update-service --cluster cex-staging --service cex-staging-api \
     --force-new-deployment --region ap-south-1
   # repeat for cex-staging-admin
   ```
3. Verify health (`/health`) and that auth still works on a test account.
4. Capture evidence (§ "Evidence to capture").

> Secrets injected via task-def `secrets[]` are read **at task start**, so a new
> value only takes effect after a new deployment. Plan the session impact below.

## 1. `DATABASE_URL`

- **Steps:** create the new DB user/password (or rotate via RDS), update the
  secret, `force-new-deployment` for **api, admin, worker, scanner**. Keep the
  old credential valid until all tasks cut over, then revoke it.
- **Session impact:** none for end-user sessions (DB creds ≠ JWT). Brief
  in-flight connection churn during deploy.
- **Rollback:** repoint the secret to the previous (still-valid) credential and
  redeploy. Do not drop the old DB user until the new one is confirmed.

## 2. `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`

- **Session impact (important):** rotating `JWT_ACCESS_SECRET` invalidates all
  **access** tokens (users re-use their refresh token → seamless within minutes).
  Rotating `JWT_REFRESH_SECRET` invalidates all **refresh** tokens → every user
  must log in again. Rotate refresh secrets during a low-traffic window or as a
  deliberate "log everyone out" action (e.g. suspected token compromise).
- **Staged rollout:** if the code supports a previous-secret grace list, stage
  it (accept old+new, then drop old). Today it is single-secret, so treat
  refresh-secret rotation as a global session reset.
- **Rollback:** revert the secret value + redeploy; tokens minted under the
  reverted secret validate again (only do this if rotation was erroneous).

## 3. `OTP_HASH_SECRET`

- **Steps:** standard procedure (§0). HMAC key over email OTP codes.
- **Impact:** any **in-flight** (unverified) OTP codes become invalid — users
  simply request a new code. No session logout. Low user impact.
- **Rollback:** revert value + redeploy if a misconfiguration is found.

## 4. `KYC_ENCRYPTION_KEY` (also seals user/admin TOTP secrets — handle with care)

- **This key is envelope-style, not a simple swap.** It derives the AES-256-GCM
  key (static salt) that sealed existing KYC PII rows **and** every user/admin
  TOTP seed. Changing it makes existing ciphertext **undecryptable** unless you
  re-wrap.
- **Correct rotation = re-encrypt, not replace:** with both old and new keys
  available, decrypt-then-re-encrypt every `*_enc` PII column and every
  `totpSecretEnc` (a migration job), then cut over. Do **not** just put a new
  value — that would break KYC reads and lock out all 2FA admins/users.
- **Admin lockout prevention:** because admin/user TOTP seeds are sealed with
  this key, a naive rotation logs out every 2FA admin. Run the re-wrap migration
  and verify a test admin can complete TOTP **before** cutting over.
- **Recommendation:** split into a dedicated `TOTP_ENCRYPTION_KEY` first (so PII
  and 2FA rotate independently) — tracked as a production blocker.

## 5. Payment gateway — `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`

- **Steps:** rotate the key/webhook secret in the Razorpay dashboard, update the
  matching Secrets Manager secret, redeploy api (+ worker if it verifies
  webhooks). In staging `RAZORPAY_PROVIDER=mock`, so this is a no-op until live.
- **Impact:** none on user sessions. Mis-rotation breaks deposit
  capture/webhook verification → monitor INR deposit flow after rotation.
- **Rollback:** revert to the previous key in both Razorpay and the secret.

## 6. KYC / email / SMS / webhook secrets

- `KYC_WEBHOOK_SECRET`: rotate with the provider, update secret, redeploy api.
  In-flight webhooks signed with the old secret will fail — coordinate with the
  vendor's rotation window.
- **Email (SES):** no secret env var — uses the ECS task IAM role. "Rotation" =
  rotate/scope the IAM role or SES identity, not a secret.
- **SMS:** `SMS_PROVIDER=none` today; when a provider token exists, rotate via
  the provider dashboard + Secrets Manager + redeploy api.

## 7. Emergency rotation (suspected leak)

1. Treat as an incident (`docs/security/cert-in-incident-response.md`; 6-hour
   clock if reportable).
2. Rotate the affected secret **immediately** (§0). For signing secrets
   (`JWT_*`) also **revoke sessions** (Redis denylist) so existing tokens die.
3. If a KMS CMK may be compromised, follow `kms-readiness.md` §8 (re-key).
4. Preserve CloudTrail evidence of access; do not delete logs.
5. Document timeline (UTC + IST), who rotated, and verification.

## 8. Staged rollout & rollback summary

- Rotate **one** secret at a time; verify health + a test login between each.
- Roll services in order: worker/scanner first (no user-facing sessions), then
  api, then admin — so a bad value is caught before it hits the admin surface.
- Keep the previous value available (Secrets Manager versions / `AWSPREVIOUS`)
  until the new one is confirmed; `update-service --force-new-deployment` to
  revert. Never delete the old secret version until cutover is verified.

## 9. Evidence to capture after rotation

- `describe-secret` metadata showing a new `LastChangedDate` (NOT the value):
  ```bash
  aws secretsmanager describe-secret --secret-id <name> \
    --query '{name:Name,changed:LastChangedDate,rotation:RotationEnabled,kms:KmsKeyId}' \
    --output table --region ap-south-1
  ```
- The ECS deployment id / time and a passing `/health` check.
- For `JWT_*`/emergency rotations: confirmation that sessions were revoked.
- Operator name + UTC/IST timestamp. File alongside the evidence pack
  (`scripts/security/collect-secrets-evidence.ps1` output) — **no values**.
