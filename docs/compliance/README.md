# EXORA — Compliance Documentation Index

**Mode: INR_ONLY staging/demo. Crypto globally disabled.**

> These documents describe **technical** controls and policy intent for a
> staging/demo platform. They are **not** a legal/FIU/PMLA certification. FIU
> registration and legal opinions are handled separately by qualified
> professionals.

---

## Policy documents

| Document | Purpose |
|---|---|
| [platform-overview.md](./platform-overview.md) | What EXORA is (INR_ONLY staging/demo). |
| [inr-only-mode.md](./inr-only-mode.md) | INR-only mode + global crypto kill-switches. |
| [kyc-policy.md](./kyc-policy.md) | KYC policy intent. |
| [aml-cft-policy.md](./aml-cft-policy.md) | AML/CFT policy intent. |
| [sanctions-pep-screening-policy.md](./sanctions-pep-screening-policy.md) | Screening policy intent. |
| [transaction-monitoring-policy.md](./transaction-monitoring-policy.md) | Monitoring policy intent. |
| [record-retention-policy.md](./record-retention-policy.md) | Record retention policy. |
| [admin-rbac-audit-policy.md](./admin-rbac-audit-policy.md) | Admin RBAC + audit policy. |
| [production-blockers.md](./production-blockers.md) | **Single source of truth** — Stage 8 final register: production / crypto / FIU-legal blockers, security hardening gaps, staging accepted risks, mitigated items. |

## FIU technical evidence pack (Stage 7)

> Technical-readiness evidence only — **not** FIU compliance/registration, legal
> readiness, or production crypto readiness.

| Document | Purpose |
|---|---|
| [fiu-evidence-pack/README.md](./fiu-evidence-pack/README.md) | How to use the pack; what to give a reviewer; sign-off checklist. |
| [fiu-technical-readiness.md](./fiu-technical-readiness.md) | Overview: scope, implemented controls, gaps, disclaimers. |
| [fiu-technical-control-matrix.md](./fiu-technical-control-matrix.md) | Control area → evidence → status → owner → gap. |
| [kyc-aml-technical-workflow.md](./kyc-aml-technical-workflow.md) | Registration → KYC → admin review → records → export. |
| [transaction-monitoring-readiness.md](./transaction-monitoring-readiness.md) | Available signals + existing detection engine + proposed future rules. |
| [fiu-reporting-readiness-runbook.md](./fiu-reporting-readiness-runbook.md) | Evidence assembly, tracing, chain of custody, redaction. |
| [crypto-disabled-evidence.md](./crypto-disabled-evidence.md) | INR_ONLY / crypto-off proof + pre-crypto requirements. |

**Evidence script:** `scripts/compliance/collect-fiu-technical-evidence.ps1`
(PowerShell 5.1, read-only, no PII/secrets, output to git-ignored
`evidence-pack-output/`).

---

## Stage 8 — final cybersecurity / VAPT evidence pack

The cybersecurity/VAPT audit-freeze pack lives under `docs/security/` — start at
[../security/final-evidence-pack/README.md](../security/final-evidence-pack/README.md)
and [../security/stage-8-final-audit-readiness.md](../security/stage-8-final-audit-readiness.md).
It cross-references the restructured [production-blockers.md](./production-blockers.md).

---

**No FIU compliance, legal readiness, or production crypto readiness is claimed
by any document here.**
