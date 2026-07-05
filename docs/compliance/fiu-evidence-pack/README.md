# FIU Technical Evidence Pack (Stage 7)

**Status: TECHNICAL-READINESS EVIDENCE — staging/demo (INR_ONLY).**

> **This pack does NOT claim FIU compliance, legal readiness, or production
> crypto readiness.** It is technical evidence to *support* a future FIU/legal
> review by qualified professionals. No STR/CTR filing is automated or claimed.

---

## 1. How to use this pack

1. Read `../fiu-technical-readiness.md` (scope + what this is/is not).
2. Walk the `../fiu-technical-control-matrix.md` (control → evidence → status).
3. For depth: `../kyc-aml-technical-workflow.md`,
   `../transaction-monitoring-readiness.md`,
   `../fiu-reporting-readiness-runbook.md`, `../crypto-disabled-evidence.md`.
4. Run the read-only evidence script and attach its output.

## 2. Documents included (Stage 7)

| Doc | Purpose |
|---|---|
| `../fiu-technical-readiness.md` | Overview: scope, controls, gaps, disclaimers |
| `../fiu-technical-control-matrix.md` | Control area → evidence → status → owner → gap |
| `../kyc-aml-technical-workflow.md` | Registration → KYC → review → records → export |
| `../transaction-monitoring-readiness.md` | Available signals + existing detection engine + proposed future rules |
| `../fiu-reporting-readiness-runbook.md` | Evidence assembly, tracing, chain of custody, redaction |
| `../crypto-disabled-evidence.md` | INR_ONLY / crypto-off proof + pre-crypto requirements |

Existing policy docs referenced (not duplicated): `../kyc-policy.md`,
`../aml-cft-policy.md`, `../sanctions-pep-screening-policy.md`,
`../transaction-monitoring-policy.md`, `../record-retention-policy.md`,
`../inr-only-mode.md`, `../platform-overview.md`.

## 3. Evidence scripts

| Script | What it collects |
|---|---|
| `scripts/compliance/collect-fiu-technical-evidence.ps1` | INR_ONLY/crypto-off flags, log retention, alarms, docs presence, git, safe reachability. Read-only; no PII; no secrets. |
| `scripts/security/collect-secrets-evidence.ps1` | Secrets Manager metadata + ECS secret posture (names only). |
| `scripts/security/collect-edge-security-evidence.ps1` | CloudFront/DNS/headers/WAF/ECS/alarms edge posture. |
| `scripts/observability/verify-log-retention.ps1` | 180-day CloudWatch retention check. |

All scripts are PS 5.1-compatible, read-only, and write to the git-ignored
`evidence-pack-output/` folder.

## 4. Manual evidence to capture (screenshots / exports)

- Admin console: KYC review screen, feature-controls view showing crypto
  **Effective = Disabled**, `/admin/system` mode = INR_ONLY.
- A sample (redacted) KYC decision trail and INR deposit/withdrawal record.
- A `ComplianceCase` with linked alert + evidence pack export event.
- CloudWatch: log-group retention = 180 days; alarms list.
- AWS console: ECS task-def env showing crypto globals off (names/values are
  non-secret feature flags).

## 5. What to give the auditor / legal reviewer

- This README + the six Stage 7 docs + the control matrix.
- The read-only script outputs (`evidence-pack-output/fiu-technical-<ts>/`).
- The referenced policy docs and `production-blockers.md`.
- Redacted record samples (per the reporting runbook's redaction policy).

## 6. What NOT to claim

- Do **not** claim FIU registration/compliance, legal readiness, or production
  crypto readiness. Do **not** present mock KYC/screening as real. Do **not**
  state STR/CTR filing is automated. These are explicitly out of scope.

## 7. Known gaps

- Real KYC/liveness + sanctions/PEP/adverse-media vendors (mock today).
- Tuned transaction-monitoring rules on real data; analyst SOP + named officer.
- KMS CMK + secrets rotation; tuned WAF; SIEM/tamper-resistant logging.
- FIU registration + legal process (handled separately by professionals).
- See `../production-blockers.md` for the authoritative list.

## 8. Final sign-off checklist (technical readiness only)

- [ ] Control matrix reviewed; each "Implemented" verified against its source.
- [ ] Evidence script run; output archived (no PII/secrets present).
- [ ] INR_ONLY + crypto-off confirmed (script PASS + admin console screenshot).
- [ ] Log retention (180d) + alarms evidenced.
- [ ] KYC/AML workflow + records walkthrough done.
- [ ] Gaps + future vendor/legal dependencies acknowledged in writing.
- [ ] Reviewer informed this is **technical readiness, not compliance**.
- [ ] No secrets/PII/real user data in any shared artifact.

> Owners/dates filled out of band. This sign-off covers technical readiness for a
> staging/demo INR_ONLY platform — not a compliance or legal certification.
