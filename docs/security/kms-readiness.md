# KMS Readiness (Stage 5)

**Status: READINESS PLAN — staging/demo (INR_ONLY).**
Customer-managed KMS (CMK) for production secrets is a **production blocker**
(`docs/compliance/production-blockers.md` #9). This document is the plan; it does
not assert KMS is in place. No KMS resources are created by reading this — the
companion script is dry-run by default and requires explicit `-Apply`.

Region `ap-south-1`. Pair with `docs/security/secret-inventory.md` and
`docs/security/iam-least-privilege-readiness.md`.

---

## 1. Customer-managed key plan

| Purpose | Alias | Scope |
|---|---|---|
| Production app secrets (Secrets Manager) | `alias/exora/prod/secrets` | Encrypt all production secrets in §1 of the inventory |
| (Optional) RDS storage encryption | `alias/exora/prod/rds` | RDS at-rest CMK (separate from secrets) |
| (Optional) S3 / logs at rest | `alias/exora/prod/data` | Frontend/log buckets, log exports |
| Staging (separate key) | `alias/exora/staging/secrets` | NEVER the same key as production |

- **Symmetric**, `SYMMETRIC_DEFAULT`, key usage `ENCRYPT_DECRYPT`.
- One CMK per environment per purpose; least blast radius.

## 2. Key rotation

- Enable **automatic annual rotation** on each CMK
  (`aws kms enable-key-rotation`). AWS retains old backing material so existing
  ciphertext stays decryptable.
- KMS rotation rotates the *key material*; it does **not** rotate the secret
  *values*. Secret-value rotation is separate — see
  `docs/security/secrets-rotation-runbook.md`.

## 3. Staging vs production separation

- Distinct CMKs AND distinct Secrets Manager secrets per environment.
- A staging principal must have **no** decrypt permission on the production CMK,
  and vice-versa. Cross-environment decrypt is a production blocker.
- Staging may keep the demo/dev defaults it already uses; production must not.

## 4. IAM decrypt boundaries

- **Least privilege:** the ECS **task role** for `cex-staging-api` /
  `cex-staging-admin` gets `kms:Decrypt` (and `kms:DescribeKey`) **only** on the
  specific secrets CMK ARN — never `Resource: "*"`.
- Prefer the key **policy** + grants over broad IAM. Constrain with a
  `kms:ViaService` condition so the key is usable only via Secrets Manager:
  ```json
  { "Condition": { "StringEquals": { "kms:ViaService": "secretsmanager.ap-south-1.amazonaws.com" } } }
  ```
- The ECS **execution role** (pulls images, injects secrets at task start) needs
  decrypt only insofar as Secrets Manager injection requires it; keep it scoped
  to the same CMK + `kms:ViaService`.
- No human/admin role should have standing `kms:Decrypt` on the secrets CMK;
  use break-glass with CloudTrail logging.

## 5. Secrets Manager + CMK

- Create/replace each production secret with `--kms-key-id alias/exora/prod/secrets`
  so it is encrypted under the CMK (not the AWS-managed `aws/secretsmanager` key).
- Inject into ECS via task-def `secrets[]` (valueFrom = secret ARN), never as a
  plaintext `environment[]` entry. See the inventory §2.

## 6. CloudTrail / KMS audit evidence (read-only)

```bash
# Keys + aliases:
aws kms list-aliases --region ap-south-1 \
  --query 'Aliases[?starts_with(AliasName, `alias/exora`)].{alias:AliasName,keyId:TargetKeyId}' --output table
# Rotation status for a key:
aws kms get-key-rotation-status --key-id alias/exora/prod/secrets --region ap-south-1
# Key policy (who can use/admin it):
aws kms get-key-policy --key-id alias/exora/prod/secrets --policy-name default --region ap-south-1
# Recent Decrypt calls (who decrypted what), last events:
aws cloudtrail lookup-events --region ap-south-1 \
  --lookup-attributes AttributeKey=EventName,AttributeValue=Decrypt \
  --query 'Events[].{time:EventTime,user:Username,name:EventName}' --output table
```

> These are metadata/audit calls only. **Never** decrypt a secret value to
> "prove" anything — describe/policy/CloudTrail evidence is sufficient.

## 7. Key deletion safeguards

- Schedule deletion only with the **maximum 30-day** `--pending-window-in-days`;
  never `--force` / immediate.
- Disable before deleting; confirm via CloudTrail there are no recent `Decrypt`
  calls on the key.
- Enable a CloudWatch alarm / EventBridge rule on
  `DisableKey` / `ScheduleKeyDeletion` for the secrets CMK.
- Treat deletion of `alias/exora/prod/secrets` as irreversible data loss (every
  secret under it becomes undecryptable) — requires sign-off.

## 8. Emergency key-compromise process

1. **Contain:** disable the suspect CMK (`aws kms disable-key`) only after
   confirming a replacement path; rotate affected secret *values* immediately
   (rotation runbook) so new values are sealed under a new/clean key.
2. **Re-key:** create a new CMK, re-encrypt secrets under it, repoint Secrets
   Manager (`update-secret --kms-key-id <new>`), `update-service --force-new-deployment`.
3. **Revoke sessions** (Redis denylist) and rotate `JWT_*` so tokens minted with
   any exposed signing secret are invalidated.
4. **Investigate** via CloudTrail `Decrypt`/`GenerateDataKey` history; preserve
   evidence. Follow `docs/security/cert-in-incident-response.md` (6-hour clock).
5. **Do NOT** delete the old key until forensics complete.

## 9. Client-side decryption — never

- KYC PII, TOTP seeds, JWT signing secrets, payment/webhook secrets, and RPC
  keys are **decrypted server-side only**, inside the API/worker process.
- The frontend/mobile bundle receives only public config (`EXPO_PUBLIC_*`,
  public URLs). No CMK, no secret ARN, no plaintext secret is ever sent to a
  client. The logger redacts secret-shaped fields (`backend/src/lib/logger.ts`).

## 10. Crypto private key policy (KMS context)

No crypto private key may live in an app env var or in a Secrets Manager string
the API reads (see inventory §3). When crypto is eventually pursued, signing must
use a dedicated **HSM / KMS-backed signer service** (asymmetric KMS keys with
`Sign` only, or an external HSM) where the API never holds raw key material.
Gated by `CRYPTO_PRODUCTION_READINESS_ACK` and the crypto blockers.

---

**Do not create KMS resources from this doc.** Use
`scripts/security/collect-secrets-evidence.ps1` for read-only evidence; any
provisioning script must be dry-run by default and require explicit `-Apply`.
