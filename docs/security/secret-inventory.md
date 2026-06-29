# Secret Inventory (Stage 5)

**Status: READINESS DOCUMENTATION — staging/demo (INR_ONLY).**
**No secret VALUES appear in this file and none ever should.** This is the
authoritative catalogue of secret *categories*, where each lives, and what
production requires. Values live only in AWS Secrets Manager / the platform env
injection — never in Git, never in logs, never in this doc.

Region `ap-south-1` · ECS cluster `cex-staging` · services `cex-staging-api`,
`cex-staging-admin`. Env var names are from `backend/src/config/env.ts`.

---

## 0. Key findings (read first)

1. **One key seals both KYC PII and all 2FA seeds.** `KYC_ENCRYPTION_KEY`
   derives the AES-256-GCM key in `backend/src/lib/encryption.ts`, which is used
   for KYC PII (`panEnc`/`aadhaarRefEnc`) **and** for user + admin TOTP secrets
   (`encryptPII` in `user-security.service.ts` and `admin-rbac.service.ts`).
   There is **no separate TOTP encryption secret**. Blast radius if leaked is
   therefore large (PII + every 2FA seed). Splitting this into a dedicated
   `TOTP_ENCRYPTION_KEY` is a recommended production hardening item (see
   `docs/compliance/production-blockers.md`).
2. **No cookie/session secret exists.** Sessions are stateless JWT bearer tokens
   (HS256) with Redis-backed revocation; `JWT_ACCESS_SECRET` /
   `JWT_REFRESH_SECRET` ARE the session secrets. `COOKIE_SECURE` is only a
   boolean posture flag, not a secret.
3. **Email send uses the ECS task IAM role (SES), not a secret env var.** SMS is
   `none` today; a real SMS provider token would be a future secret.
4. **Crypto private keys do not exist and must never be an app env var.** See §3.

## 1. Secret catalogue

Legend — Plaintext env OK?: whether the value may sit as a plaintext ECS env var
(`N` = must be a Secrets Manager–injected `secret`, never plaintext). SM inj.:
Secrets Manager injection required for production. KMS CMK: customer-managed KMS
key encryption required for production.

| Env var | Purpose | Owner | Storage staging → prod | Plaintext env OK? | SM inj. (prod) | KMS CMK (prod) | Rotation | Blast radius if leaked |
|---|---|---|---|---|---|---|---|---|
| `DATABASE_URL` | Postgres connection string (creds embedded) | Platform/DBA | Secrets Manager → SM + CMK | **N** | Yes | Yes | 90d + on incident | Full DB read/write: PII, ledger, audit. **Critical.** |
| `REDIS_URL` | Redis/ElastiCache connection (may embed auth token) | Platform | env/SM → SM + CMK | **N** | Yes | Yes | 90d + on incident | Session/revocation store, OTP/lockout counters, caches. High. |
| `JWT_ACCESS_SECRET` | Signs short-lived access JWTs (HS256) | Backend | env → SM + CMK | **N** | Yes | Yes | 90d (staged) | Forge any user/access token until rotated. **Critical.** |
| `JWT_REFRESH_SECRET` | Signs refresh/session JWTs | Backend | env → SM + CMK | **N** | Yes | Yes | 90d (staged) | Mint long-lived sessions; account takeover. **Critical.** |
| `OTP_HASH_SECRET` | HMAC key over email OTP codes | Backend | SM (exists) → SM + CMK | **N** | Yes | Yes | 180d + on incident | Offline brute-force of 6-digit OTP space if DB also leaked. High. |
| `KYC_ENCRYPTION_KEY` | AES-256-GCM key for KYC PII **and** user/admin TOTP seeds | Backend/Compliance | env → SM + CMK (split key recommended) | **N** | Yes | Yes | Envelope re-wrap; 365d / on incident | Decrypt PII + all 2FA seeds. **Critical** (see §0.1). |
| `KYC_WEBHOOK_SECRET` | HMAC verify of inbound KYC provider webhooks | Backend | env → SM + CMK | **N** | Yes | Yes | 180d + on vendor change | Forge KYC webhook callbacks. Medium-High. |
| `RAZORPAY_KEY_ID` | Razorpay public-ish key id (`rzp_*`) | Payments | env → SM (low sensitivity) | Y (id) | Pref. | Pref. | On vendor rotation | Identifier; limited alone. Low. |
| `RAZORPAY_KEY_SECRET` | Signs Razorpay orders / verifies payment sigs | Payments | env → SM + CMK | **N** | Yes | Yes | 90d + on incident | Forge/verify payment intents. **High** (mock in staging). |
| `RAZORPAY_WEBHOOK_SECRET` | HMAC verify of Razorpay webhooks | Payments | env → SM + CMK | **N** | Yes | Yes | 90d + on incident | Forge deposit webhooks → false credits. **High.** |
| `TRONGRID_API_KEY` | TronGrid provider API key (deposit scanning) | Backend | env → SM + CMK | **N** | Yes | Yes | On vendor rotation | Provider quota abuse / billing. Medium. |
| `BSC_RPC_URL` / `ETH_RPC_URL` / `TRON_API_URL` | Server-side RPC endpoints (may embed provider keys) | Backend | env → SM if key-bearing | **N** if key-bearing | If key-bearing | If key-bearing | On vendor rotation | Provider abuse; never exposed to frontend. Medium. |
| Email (SES) | Outbound mail | Platform | **ECS task IAM role** (no secret env) | n/a | n/a (IAM) | n/a | IAM/role review | Send-as abuse if role over-broad. Medium. |
| SMS provider token | Future SMS OTP | Platform | n/a today (`SMS_PROVIDER=none`) → SM + CMK | **N** (future) | Yes (future) | Yes (future) | 90d (future) | SMS send abuse / billing. Medium (future). |
| Future external KYC API key | Real KYC/liveness vendor | Compliance | n/a today → SM + CMK | **N** (future) | Yes (future) | Yes (future) | Per vendor (future) | PII vendor access. High (future). |

> Cookie/session secret: **N/A** — JWT bearer + Redis revocation (see §0.2).
> Admin TOTP encryption secret: **same as `KYC_ENCRYPTION_KEY`** today (§0.1).

## 2. Production storage standard

- Every row marked `Plaintext env OK? = N` MUST be a Secrets Manager secret
  injected as an ECS task-definition `secrets[]` entry (resolved at task start),
  **not** a plaintext `environment[]` entry.
- All production secrets encrypted with a customer-managed **KMS CMK**
  (`alias/exora/prod/secrets`) — see `docs/security/kms-readiness.md`.
- Dev/default placeholder values (`backend/src/config/env.ts` `DEV_ONLY_VALUES`)
  are **rejected at boot in real production** for `JWT_*`, `KYC_ENCRYPTION_KEY`,
  `KYC_WEBHOOK_SECRET`, `OTP_HASH_SECRET`, and live-mode Razorpay keys.

## 3. Crypto private keys — PROHIBITED in app environment

**No crypto private key, mnemonic, seed phrase, or hot-wallet secret may ever be
placed in an application environment variable, Secrets Manager string consumed by
the app, `.env`, or this repo.** EXORA is INR_ONLY and `WITHDRAWAL_SIGNER=live`
is intentionally unimplemented (the resolver refuses it). Before any crypto
production enablement, signing keys require a **separate signer / HSM / KMS-backed
design** (dedicated signing service, hardware custody, no key material in the API
process). This is gated by `CRYPTO_PRODUCTION_READINESS_ACK` (Stage 5 boot guard)
and the crypto blockers in `docs/compliance/production-blockers.md`.

## 4. What this inventory deliberately excludes

Public, non-secret config (URLs, domains, distribution ids, bucket names,
master *receiving* addresses, USDT contract addresses, feature flags) — these are
surfaced read-only and are **not** secrets. They belong in normal config, never
in Secrets Manager.

---

**Never run `aws secretsmanager get-secret-value` for an audit.** Metadata
(`describe-secret`, `list-secrets`) is sufficient and is what
`scripts/security/collect-secrets-evidence.ps1` collects.
