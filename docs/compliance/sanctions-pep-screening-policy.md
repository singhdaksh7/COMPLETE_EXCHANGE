# Sanctions / PEP / Adverse-Media Screening Policy

**Mode: INR_ONLY staging/demo.** Real screening-provider integration is a
**planned production control**. In staging only a **mock/placeholder** process
runs. This is explicitly **not** an operational screening program.

---

## 1. Objective

Screen customers (and, in production, relevant counterparties) against:

- **Sanctions** lists (e.g. UN, MHA/India, and other applicable lists),
- **PEP** (Politically Exposed Persons),
- **Adverse media**.

## 2. Staging (current) — mock / placeholder process

- A vendor-neutral screening abstraction exists with **mock** results only.
  Selecting an external provider falls back to the mock so **no real paid vendor
  is ever called from staging**.
  Evidence: `backend/src/modules/compliance/screening/`,
  `screening.service.ts`, `backend/src/config/env.ts` (`SCREENING_PROVIDER`).
- Screening produces per-dimension postures (CLEAR / PENDING / POSSIBLE_MATCH /
  HIT / REVIEW_REQUIRED). A possible match routes to **manual admin review**; an
  admin can mark APPROVED / FALSE_POSITIVE (→ clear) or REJECTED (→ confirmed
  hit).
  Evidence: `screening.service.ts` (`checkPosture`, `isBlocking`).
- The "require sanctions clear before approval" gate exists but **defaults OFF**
  in staging so mock onboarding can complete; manual review is the control.

### Interim manual process (staging)

1. For any customer flagged by the mock as POSSIBLE_MATCH, a compliance admin
   reviews and records a decision with a reason (audited).
2. Confirmed hits lead to KYC rejection / restriction; false positives are
   cleared with a note.
3. All actions are written to the append-only audit + admin logs.

## 3. Production requirement (must be implemented before go-live)

- Integrate a **real screening provider** (sanctions + PEP + adverse media) via
  the existing abstraction.
- Set `SCREENING_PROVIDER` to the real provider and **enable**
  `COMPLIANCE_REQUIRE_SANCTIONS_BEFORE_APPROVAL` so a customer cannot be approved
  with an unresolved sanctions posture.
- Define list sources, match thresholds, ongoing re-screening cadence, and
  escalation SLAs.
- Retain screening results and decisions per `record-retention-policy.md`.

## 4. Limitations (do not over-claim)

- Staging performs **no real sanctions/PEP/adverse-media screening**.
- The control is **manual + mock** today; it is suitable to demonstrate the
  workflow, not to meet an operational obligation.

Tracked as a production blocker in `production-blockers.md`.
