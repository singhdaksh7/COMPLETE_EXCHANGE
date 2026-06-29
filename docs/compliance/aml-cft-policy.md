# AML / CFT Policy

**Mode: INR_ONLY staging/demo.** Monitoring and screening run on
**detection-only heuristics and mock providers**. FIU filing is **not
automated** — only masked drafts are assembled. This policy defines the
framework and production requirements.

---

## 1. Purpose

Establishes EXORA's Anti-Money-Laundering (AML) and Combating-the-Financing-of-
Terrorism (CFT) framework, aligned with the PMLA and FIU-IND expectations for a
reporting entity. Operational compliance requires the production controls noted
throughout and in `production-blockers.md`.

## 2. Customer Due Diligence (CDD)

- Every user completes KYC before transacting on INR rails (see `kyc-policy.md`).
- Identity data is validated and stored encrypted; access to a user's PII is
  RBAC-restricted and audited.
- A baseline risk grade is assigned (configurable default) and refined by risk
  signals.

## 3. Enhanced Due Diligence (EDD)

- Higher-risk customers (e.g. risk signals, screening review-required, high
  activity) are routed to **manual/enhanced review** before/while transacting.
- EDD currently relies on **manual compliance review** plus the compliance case
  workflow; automated EDD enrichment is a production enhancement.
  Evidence: `backend/src/modules/compliance/` (case + workspace services).

## 4. Risk scoring

- A risk engine assigns a risk level (LOW/MEDIUM/HIGH/PROHIBITED) from available
  signals; gates such as "require sanctions clear before approval" exist as
  configuration and **default permissive in staging** so the mock onboarding can
  complete end-to-end.
  Evidence: `backend/src/modules/compliance/compliance.risk.ts`,
  `backend/src/config/env.ts` (`COMPLIANCE_*` flags).
- **Production:** enable the gates and wire real screening before approval.

## 5. Transaction monitoring

- A detection-only monitoring engine evaluates patterns (structuring, abnormal
  volume, repeated failed withdrawals, rapid deposit→withdrawal correlation,
  high-value transfers) and raises alerts/cases. It **never blocks** money
  movement by itself.
  Evidence: `backend/src/modules/compliance/monitoring.rules.ts`,
  `monitoring.service.ts`. Details in `transaction-monitoring-policy.md`.

## 6. Suspicious activity escalation

- Alerts feed a **compliance case workflow** (open → investigate → resolve) with
  an internal audit trail. Cases can reference users, alerts, and evidence.
  Evidence: `backend/src/modules/compliance/case.service.ts`,
  `workspace.service.ts`.
- Escalation, internal STR drafting, and review are **manual**.

## 7. Internal compliance review

- Compliance admins (RBAC-gated) review cases, add internal notes, and record
  decisions. All actions are written to the append-only audit trail and admin
  logs.

## 8. FIU reporting readiness

- EXORA can assemble **masked STR/CTR/NTR drafts** from existing compliance data
  for internal review/manual export. Every draft is labelled
  `FIU_DRAFT_REPORT_STAGING_ONLY` / `NOT_SUBMITTED_TO_FIU`, contains no secrets
  or raw PAN/Aadhaar, and is **never transmitted** to FIU-IND or any portal.
  Evidence: `backend/src/modules/compliance/fiu.service.ts`.
- **Do not automate real FIU filing.** Real submission is an out-of-scope
  production process requiring registration and the official FINnet/FIU channel.

## 9. Governance

- Designated Compliance/Security Officer is accountable (see incident-response
  contact checklist).
- Policies in this folder are reviewed before production and updated as controls
  are implemented.

## 10. Production requirements (not implemented in staging)

- Real sanctions/PEP/adverse-media screening provider (`sanctions-pep-screening-policy.md`).
- Real transaction-monitoring tuning and case SLAs.
- FIU registration and manual reporting procedure (no automation).
- Enabling the risk gates that default permissive in staging.

**Staging is a framework demonstration, not an operational AML program.**
