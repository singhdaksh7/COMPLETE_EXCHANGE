# Crypto Disabled — Compliance Evidence (Stage 7)

**Status: TECHNICAL EVIDENCE — staging/demo (INR_ONLY).**
Proof that EXORA runs INR-only with **all crypto rails globally disabled**, and
what must happen before crypto could ever be enabled. Relevant to audit/FIU
technical readiness because it bounds the regulated surface (no crypto
deposits/withdrawals/custody today). Policy intent: `docs/compliance/inr-only-mode.md`.

---

## 1. Platform mode: INR_ONLY

- The platform reports mode **INR_ONLY** while every crypto global flag is off
  (`toGlobalFeatureStatus` in `feature-controls.types.ts`; surfaced on
  `/admin/system` and in `/auth/me` `globalFeatureStatus.mode`).

## 2. Global crypto flags OFF (default)

`backend/src/config/env.ts` → `config.featureFlags`:

| Flag | Default | Effect when false |
|---|---|---|
| `CRYPTO_DEPOSITS_GLOBAL_ENABLED` | `false` | Crypto deposits globally off |
| `CRYPTO_WITHDRAWALS_GLOBAL_ENABLED` | `false` | Crypto withdrawals globally off |
| `CRYPTO_WALLET_GLOBAL_ENABLED` | `false` | Crypto wallet surface globally off |
| `INR_DEPOSITS_GLOBAL_ENABLED` | `true` | INR deposits on |
| `INR_WITHDRAWALS_GLOBAL_ENABLED` | `true` | INR withdrawals on |
| `TRADING_GLOBAL_ENABLED` | `true` | Trading on |

## 3. Per-user gates are ineffective unless the global is on

Effective access is `globalFlag && userFlag` (`toEffectiveAccess`,
`feature-controls.types.ts`). So even if an admin toggles a crypto flag ON for a
single user, **effective access stays disabled** while the global crypto flag is
off. Crypto positive flags also default OFF for new accounts
(`POSITIVE_FLAGS_DEFAULT_OFF`).

## 4. Crypto wallet/deposit/withdraw APIs blocked by global controls

- Crypto routes (`/api/v1/wallets`, `/api/v1/deposits/crypto`,
  `/api/v1/withdrawals`) are gated by `requireUserFeature(...)`, which evaluates
  the global-AND-user rule and returns `FEATURE_DISABLED_FOR_USER` while crypto
  is globally off (`withdrawal.routes.ts` and peers).
- **Live withdrawal signing is disabled regardless** — `WITHDRAWAL_SIGNER=live`
  is unimplemented and the resolver refuses it (`withdrawal/providers/index.ts`);
  the mock signer holds no keys.
- **Note on `CRYPTO_DEPOSITS_ENABLED`:** the staging task def may set the legacy
  Stage 12 master-wallet deposit switch `CRYPTO_DEPOSITS_ENABLED=true`. This does
  **not** enable crypto: it sits *below* the Stage 15 global gate, so while
  `CRYPTO_DEPOSITS_GLOBAL_ENABLED=false` the master-wallet deposit surface is
  inaccessible (effective access = global AND feature). The authoritative
  off-switch for audit purposes is the `CRYPTO_*_GLOBAL_ENABLED` set being false.

## 5. Stage 5 production boot guard

Real production (`NODE_ENV=production` AND `APP_ENV!=staging`) **refuses to boot**
if any `CRYPTO_*_GLOBAL_ENABLED=true` unless `CRYPTO_PRODUCTION_READINESS_ACK=true`
(`backend/src/lib/prod-safety.ts`, tests in `prod-safety.test.ts`). This is a
safety latch, not approval.

## 6. Frontend hides crypto features

The user frontend hides crypto deposit/wallet surfaces while the global crypto
flags are off (driven by the `globalFeatureStatus`/feature map from `/auth/me`).
The admin feature-controls view shows **User permission / Global status /
Effective access** so an operator sees a crypto flag reads Effective=Disabled
while the global is off (`UserFeatureControlsDto`).

## 7. Why this matters for audit / FIU technical readiness

With crypto globally off, the regulated surface is **INR-only**: no crypto
custody, no on-chain settlement, no Travel-Rule obligations active. This bounds
the technical scope an auditor/FIU reviewer must consider today and makes the
"crypto off" state itself an evidenced control.

## 8. What must happen before crypto is EVER enabled

All of the following — none are in scope now:

- **FIU / legal sign-off** (registration, Principal Officer, legal opinion).
- **Real KYC/AML vendor integration** (KYC/liveness + sanctions/PEP/adverse-media).
- **Custody / signer architecture** (HSM/KMS-backed signer service; **no private
  keys in app env** — `docs/security/secret-inventory.md` §3).
- **Blockchain-to-ledger reconciliation**.
- **Transaction monitoring** tuned on real data.
- **Travel Rule evaluation** for crypto transfers.
- **Independent VAPT / security sign-off**.
- Flip of `CRYPTO_PRODUCTION_READINESS_ACK` only after the above
  (`docs/compliance/production-blockers.md` #19–#22).

## 9. How to verify (read-only)

```bash
# Crypto flags in the live task def (names/values are non-secret):
aws ecs describe-task-definition --task-definition cex-staging-api --profile cex-staging --region ap-south-1 \
  --query "taskDefinition.containerDefinitions[0].environment[?contains(name,'CRYPTO')]" --output table
# Live mode echo (authenticated): /auth/me -> globalFeatureStatus.mode == "INR_ONLY"
```
Or run `scripts/compliance/collect-fiu-technical-evidence.ps1` (read-only).

---

**Crypto stays OFF.** This document evidences the disabled state; it does not
enable anything.
