# INR_ONLY Mode

**Mode: INR_ONLY staging/demo.** This document explains why and how crypto
movement is disabled, and how access is controlled.

---

## 1. Why crypto deposit/withdrawal is disabled

EXORA is operating as an INR-focused staging/demo MVP ahead of FIU-IND
registration, compliance/licensing sign-off, and Travel Rule readiness. Until
those are in place, **no crypto value movement is permitted**. Disabling crypto:

- avoids any real custody/transfer of crypto assets before an independent
  wallet/signer audit and live reconciliation are complete;
- keeps the demo within the INR rails that are appropriate for the current
  compliance posture;
- ensures a leaked/compromised account cannot move crypto value.

## 2. How it is enforced (defense in depth)

1. **Global feature controls / INR_ONLY policy.** Crypto "positive" capability
   flags (e.g. `canDepositCrypto`, `canWithdrawCrypto`) **default OFF**; INR and
   trading default ON. A fresh account is INR-only by default.
   Evidence: `backend/src/modules/feature-controls/feature-controls.types.ts`.
2. **Effective access = global AND per-user.** Even if a per-user flag were
   enabled, the global compliance switch must also allow it, so a per-user toggle
   cannot bypass INR_ONLY.
   Evidence: `backend/src/modules/feature-controls/feature-controls.service.ts`.
3. **Route gating.** Crypto withdrawal endpoints require the feature via
   `requireUserFeature('canWithdrawCrypto', 'blockHighRiskActivity')`.
   Evidence: `backend/src/modules/withdrawal/withdrawal.routes.ts`.
4. **Live signing disabled.** The withdrawal signer resolver throws if
   `WITHDRAWAL_SIGNER=live`; only an **offline mock signer that holds no keys and
   broadcasts nothing** is available.
   Evidence: `backend/src/modules/withdrawal/providers/index.ts`,
   `withdrawal-signer.mock.ts`.

## 3. Per-user access controls

- Each user has a feature-control row (or computed defaults) governing what they
  can do (deposit INR, trade, withdraw INR, etc.).
- Restriction flags (e.g. block high-risk activity, withdrawals blocked) can be
  set by compliance to further constrain a specific user.
- Changes to a user's controls are recorded to the admin log and the append-only
  audit log with the acting admin, the field, old/new values, and a reason.
  Evidence: `feature-controls.service.ts`.

## 4. Safe demo mode

In INR_ONLY staging/demo:

- INR deposits (gateway + manual), trading, and the double-entry ledger are
  exercised end-to-end.
- Crypto value cannot enter or leave the platform.
- KYC and compliance run on **mock providers** (no real PII is sent to a vendor),
  and FIU reporting is **draft-only** (never transmitted).
- Production-only protections (KMS, WAF, private admin edge, SIEM) are tracked as
  blockers and are not required to demonstrate the INR workflows safely.

## 5. To exit INR_ONLY (out of scope here)

Re-enabling crypto requires, at minimum: real KYC/liveness + sanctions/PEP
providers, Travel Rule readiness, an independent wallet/signer audit,
KMS-managed signing keys, blockchain-to-ledger reconciliation, and the relevant
regulatory clearances. See `production-blockers.md`. **None of these are enabled
in this work.**
