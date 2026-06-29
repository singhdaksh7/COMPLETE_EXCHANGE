# CERT-In Incident Response Process

**Status: PROCESS DEFINED — partial operational readiness.**
**Mode: INR_ONLY staging/demo. This document defines the process; it does NOT
assert full CERT-In compliance.** See "Readiness gaps" at the end.

This process aligns EXORA with the CERT-In Directions (No. 20(3)/2022, in force
from 28 June 2022), notably the **6-hour incident reporting** obligation and
**180-day log retention** for ICT systems.

---

## 1. Scope

Applies to security incidents affecting EXORA's backend APIs, admin panel,
database (PII/KYC, ledger, audit trails), authentication/session system, and
supporting cloud infrastructure. Reportable incident types include (CERT-In
Annexure I): unauthorized access, data breaches/leaks of PII, account
compromise, identity theft/phishing, attacks on servers/applications, and
malicious code.

## 2. Incident detection

Sources that can surface an incident today:

- Application audit trails: `audit_logs` / `admin_logs` (login, failed login,
  token-reuse, admin actions, KYC/INR approvals) — append-only.
- Auth security events already recorded: `auth.login_failed`,
  `auth.login_locked`, `auth.token_reuse_detected`
  (`backend/src/lib/audit.ts`).
- Brute-force lockout counters (Redis) for user and admin login.
- CloudWatch logs / metrics (manual review today; **centralized SIEM alerting is
  a known gap** — see `docs/compliance/production-blockers.md`).
- External reports (responsible disclosure, hosting/provider notice).

## 3. Triage & severity

On a suspected incident, the on-call responder records: time of detection (UTC
and IST), source, affected systems, and an initial severity:

| Severity | Examples | Target action start |
|---|---|---|
| **SEV-1 Critical** | PII/KYC data exposure, ledger/funds integrity, admin account takeover | Immediate |
| **SEV-2 High** | Auth bypass, privilege escalation, repeated targeted intrusion attempts | < 1 hour |
| **SEV-3 Medium** | Isolated suspicious activity, single compromised user account | < 4 hours |
| **SEV-4 Low/Info** | Scanning, low-impact misconfiguration | Next business day |

The **6-hour CERT-In reporting clock starts at detection** for reportable
incidents — do not wait for full root cause before reporting (see §6).

## 4. Containment

- Revoke affected sessions: user (`auth.service` session revocation + Redis
  denylist) and admin (suspend admin → `revokeAllAdminSessions`).
- Lock affected accounts; rotate exposed credentials/secrets.
- If platform-level: invoke the global withdrawal freeze kill-switch and/or set
  the platform to a safe state via feature controls (note: crypto is already
  globally disabled in INR_ONLY mode).
- Block offending IPs/ranges (admin IP allowlist; upstream firewall/WAF when
  provisioned).
- Preserve the affected component before remediation where feasible (snapshot).

## 5. Evidence preservation

- **Do not delete logs or audit rows.** `audit_logs`, `admin_logs`,
  `ledger_entries`, and webhook-event tables are append-only by DB trigger;
  preserve them.
- Snapshot the RDS instance (point-in-time / manual snapshot) at the time of
  detection.
- Export relevant CloudWatch log ranges to secure storage; record hashes of
  exported files for integrity.
- Capture the responder's timeline (detection → containment → recovery) with
  UTC+IST timestamps.
- Retain all incident evidence for **at least 180 days** (ICT logs) and longer
  for financial/KYC records per `docs/compliance/record-retention-policy.md`.

## 6. Reporting responsibility & 6-hour readiness

- **Accountable owner:** Designated Compliance/Security Officer (see contact
  checklist §8). Backup: Engineering lead.
- For a reportable incident, notify CERT-In **within 6 hours of becoming aware**,
  via the CERT-In channels (email `incident@cert-in.org.in`, the CERT-In
  Incident Reporting Form, or phone as published on cert-in.org.in).
- Provide: incident type, affected systems, timeline, IP/indicators, current
  status, and contact. Update as the investigation progresses.

> **Readiness note:** the 6-hour clock requires a pre-assigned owner, a ready
> reporting template, and reliable detection. Detection is currently
> **log/audit-trail based with manual review** — automated SIEM alerting is a
> production blocker. Treat 6-hour reporting as *process-ready but
> detection-limited* until SIEM alerting is in place.

## 7. Communication steps

1. Internal: open an incident channel; notify the accountable owner + engineering
   lead immediately for SEV-1/2.
2. Regulator: CERT-In within 6 hours (reportable incidents).
3. Affected users: notify per legal guidance if PII is impacted (DPDP Act
   considerations) — user-safe messaging only, no internal detail.
4. Providers: notify hosting / payment (Razorpay) / any data processor as
   relevant.
5. Maintain a single source of truth for status updates.

## 8. Point-of-contact checklist

| Role | Name | Email | Phone | Backup |
|---|---|---|---|---|
| Compliance/Security Officer (accountable) | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| Engineering on-call | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| Legal / DPO | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| Cloud/Infra owner | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| CERT-In | — | incident@cert-in.org.in | as published | — |
| Razorpay support | — | _TBD_ | _TBD_ | — |

> Fill in real contacts before relying on this process operationally.

## 9. Post-incident review

- Conduct a blameless post-incident review within 5 business days.
- Document root cause, timeline, what worked, what failed, and corrective
  actions with owners and due dates.
- Feed corrective actions into the backlog and, where relevant, into
  `docs/compliance/production-blockers.md`.
- Re-test the fix and preserve the retest evidence (link from the VAPT evidence
  pack).

---

## Readiness gaps (do not claim full compliance until closed)

- Centralized **SIEM alerting** (failed-login, admin-risk, suspicious activity)
  — currently manual log review.
- **180-day retention** must be enforced on all CloudWatch log groups (see
  `docs/security/log-retention-180-days.md`).
- **NTP/time-sync** assurance across hosts.
- Real, named **points of contact** must be filled in above.
- This is a **staging/demo** system (INR_ONLY); production deployment adds WAF,
  private admin edge, and KMS-managed secrets (tracked as production blockers).
