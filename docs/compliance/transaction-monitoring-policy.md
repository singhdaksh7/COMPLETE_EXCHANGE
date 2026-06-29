# Transaction Monitoring Policy

**Mode: INR_ONLY staging/demo.** Monitoring is **detection-only**: it raises
alerts/cases for review and **never blocks money movement** on its own. Crypto
monitoring is inactive because crypto is disabled.

---

## 1. Scope

Monitors activity on the rails active in INR_ONLY mode:

- **INR deposits** (gateway + manual) and **INR withdrawals**.
- **Trading** activity (order/trade volume).
- Account/auth signals relevant to fraud (failed logins, new-device logins).

Crypto deposit/withdrawal monitoring exists in code but is **not exercised** in
INR_ONLY mode (crypto disabled).

## 2. Monitored patterns (detection-only heuristics)

Configurable thresholds (`backend/src/config/env.ts`, `COMPLIANCE_MONITORING_*`),
evaluated by the monitoring engine
(`backend/src/modules/compliance/monitoring.rules.ts`):

- **Structuring** — multiple transfers each just below a band within a window.
- **Abnormal volume** — summed value over a window crosses a threshold.
- **High-value transfer** — a single transfer at/above a high-value threshold.
- **Repeated failed/rejected withdrawals** within a window.
- **Rapid deposit → withdrawal** correlation within minutes.

These are **heuristics for review**, not automated enforcement.

## 3. INR deposit / withdrawal monitoring

- Manual INR deposits require admin approval (maker-checker for amounts at/above
  a threshold); amount-tampering protection compares integer paise; duplicate
  UTRs are blocked by a unique index.
  Evidence: `backend/src/modules/deposit/deposit.service.ts`.
- INR withdrawals run through a reserved-ledger lifecycle with admin review.
  Evidence: `backend/src/modules/inr-withdrawal/`.
- All approvals/rejections are audited (audit_logs + admin_logs).

## 4. Trading monitoring

- Abnormal trading volume is included in the monitoring heuristics; trades settle
  atomically and idempotently through the ledger and are append-only.
  *(Matching/settlement logic is out of scope for changes.)*

## 5. Suspicious patterns → cases

- When a rule fires, an **alert** is raised and can be promoted to a **compliance
  case** for investigation (open → investigate → resolve).
  Evidence: `backend/src/modules/compliance/case.service.ts`,
  `monitoring.service.ts`, `workspace.service.ts`.

## 6. Manual review

- Compliance admins (RBAC-gated) triage alerts/cases, add internal notes, and
  record outcomes. Escalation to an internal STR draft is manual (see
  `aml-cft-policy.md`).

## 7. Admin audit trail

- Every monitoring/compliance admin action is written to the **append-only**
  `audit_logs` and `admin_logs` with actor, target, reason, and timestamp.
  Evidence: `backend/src/lib/audit.ts`, DB append-only triggers.

## 8. Production requirements (not implemented in staging)

- Threshold tuning against real traffic and documented case-handling SLAs.
- Centralized alerting (SIEM) for suspicious-withdrawal / admin-risk events
  (currently no automated alert delivery) — see `production-blockers.md`.
- Re-enable and tune crypto monitoring only when crypto is permitted (with
  blockchain-to-ledger reconciliation in place).

**Staging demonstrates the monitoring framework; it is not a tuned, alerting
production monitoring program.**
