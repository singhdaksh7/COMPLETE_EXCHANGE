# Record Retention Policy

**Mode: INR_ONLY staging/demo.** Retention is **review-only and
non-destructive** in code today: the system records retention policies and never
auto-deletes records. Enforced retention windows in infrastructure are a
production task.

---

## 1. Principles

- **Non-destructive:** compliance and financial records are retained, not
  silently purged. The retention service produces review snapshots only and
  **never deletes** a record.
  Evidence: `backend/src/modules/compliance/retention.service.ts`.
- **Tamper-evidence:** audit and ledger records are append-only (DB triggers
  reject UPDATE/DELETE).
- **Jurisdiction:** ICT logs for CERT-In are retained within Indian jurisdiction.

## 2. Retention schedule (baseline policy)

| Record type | Baseline retention | Notes |
|---|---|---|
| KYC / enhanced-KYC profiles | **5+ years** | PMLA baseline; production policy may extend |
| INR transaction records (deposit/withdrawal) | **5+ years** | Financial record retention |
| Compliance evidence / cases / STR drafts | **5–8 years** | STR cases longer |
| Audit / admin action logs | **8 years** (policy) | Append-only |
| ICT system logs (CloudWatch) | **180 days (CERT-In)** | See readiness note §4 |
| Wallet-risk / Travel-Rule records | **5 years** | Inactive in INR_ONLY (crypto off) |

Baseline years are seeded by the retention registry
(`retention.service.ts`, `DEFAULT_POLICIES`) and are configurable
(`COMPLIANCE_RECORD_RETENTION_YEARS`).

## 3. KYC and transaction records retention

- KYC profiles, decisions, and INR transaction history are stored in PostgreSQL
  (PII encrypted at rest) and are retained per the schedule above.
- Deletion/anonymization, where ever required by law, is a controlled,
  out-of-scope process — **this work does not change any compliance data
  deletion behavior.**

## 4. Logs retention — 180-day CERT-In ICT readiness

- The application emits structured, redacted logs; **180-day retention on
  CloudWatch log groups is a readiness item**, with exact verification/apply
  steps documented in `docs/security/log-retention-180-days.md`.
- This is **not yet enforced in IaC** and must be set/verified in AWS.

## 5. Audit evidence retention

- `audit_logs`, `admin_logs`, `ledger_entries`, and webhook-event tables are
  append-only and preserved as evidence.
- Incident evidence is preserved per `docs/security/cert-in-incident-response.md`
  (snapshots, exported log ranges with integrity hashes).

## 6. Longer financial / KYC retention (production policy)

- Production retention for KYC and financial records typically **exceeds** the
  180-day ICT log window (multi-year, per PMLA and sectoral guidance). The
  180-day figure applies to **ICT logs**, not to KYC/financial records.

## 7. Production requirements (not implemented in staging)

- Enforce CloudWatch 180-day retention (and codify in IaC).
- Centralized, access-controlled, tamper-resistant long-term log store.
- Formal, lawful data-deletion/anonymization procedure where applicable.

Tracked in `production-blockers.md`.
