# FIU Reporting Readiness Runbook (Stage 7)

**Status: TECHNICAL-READINESS RUNBOOK — staging/demo (INR_ONLY). Not a
compliance claim.**

> **STR / CTR / FIU filing is a legal/compliance PROCESS performed by qualified
> professionals — it is NOT automated and NOT claimed here.** This runbook only
> describes how the compliance/admin team can *technically* assemble evidence for
> a case from existing records.

---

## 1. How the team assembles evidence for a case

1. Open/locate the `ComplianceCase` (or create one from a `ComplianceAlert`).
2. Use the case workspace (`workspace.service.ts`) to gather linked records.
3. Assemble a `ComplianceEvidencePack` (`evidence.service.ts`) referencing the
   tables/logs below; record the export in `ComplianceExportEvent`.
4. For a draft FIU report, use `fiu.service.ts` (draft/internal export only —
   **never transmitted**). Filing happens out-of-band via the legal channel.

## 2. What to export (tables / logs / docs)

| Aspect | Source |
|---|---|
| User identity | `User`, `KycProfile`, `ComplianceProfile` (PII sealed; redact on export) |
| KYC decision | `KycProfile.status` history, `KycDocument`, `KycWebhookEvent`, `AdminLog` |
| Deposits | `InrTransaction`, `PaymentWebhookEvent` |
| Withdrawals | `InrWithdrawal` (+ payout reference) |
| Ledger entries | `LedgerTransaction`, `LedgerEntry`, `AccountBalance` |
| Admin actions | `AdminLog` (append-only) |
| Admin accountability (who did what) | `GET /admin/v1/admins/:id/profile` + `/activity` (Stage 7A) — per-admin summary + filterable timeline over `AdminLog`; admin rows are soft-deactivated, never deleted |
| Auth / security events | `AuditLog`, `LoginAttempt`, `AuthSession` |
| Screening / risk | `ScreeningCheck`, `ScreeningMatch`, `RiskAssessment` |
| Alerts / cases | `ComplianceAlert`, `ComplianceCase`, `ComplianceCaseNote`, `...Event` |

## 3. Tracing a subject end-to-end

For a user id, trace:
`User` → `KycProfile` (identity + decision) → `Account`/`AccountBalance` →
`InrTransaction` (deposits) → `InrWithdrawal` (withdrawals + payout ref) →
`LedgerTransaction`/`LedgerEntry` (money truth) → `AdminLog` (who approved what)
→ `AuditLog`/`LoginAttempt` (auth/security) → `ComplianceAlert`/`ComplianceCase`
(any flags). Pivot cross-system on `requestId` and user id.

## 4. Evidence chain of custody

- Records are **append-only** at source (`AuditLog`, `AdminLog`, `LedgerEntry`
  enforced by DB trigger) — do not mutate them.
- For each export: record who exported, when (UTC+IST), the query/time range, and
  the **SHA-256** of each exported file. Log it in `ComplianceExportEvent` and
  the evidence pack.
- Preserve originals; share only redacted copies (next section).

## 5. Redaction policy

- Never export raw PAN/Aadhaar/secrets. PII is sealed at rest (`lib/encryption.ts`)
  and redacted in logs (`lib/logger.ts`).
- For external sharing, redact PII to the minimum the reviewer needs; mask
  account numbers; never include secrets/tokens. The technical evidence script
  emits **metadata only** and no PII by default.

## 6. Who can access reports

- Only permission-gated compliance/admin roles (admin RBAC) may assemble or
  export evidence; actions are logged in `AdminLog`. External sharing follows the
  organisation's legal/data-protection approval (DPDP considerations).

## 7. Manual today vs automated later

| Today (manual) | Later (potential automation) |
|---|---|
| Case assembly + export are operator-driven | Templated case bundles |
| FIU report is a **draft** assembled, then filed via legal channel | (Filing stays a legal process regardless) |
| Redaction is a manual review step | Policy-driven redaction tooling |
| Alert triage is analyst-driven | Tuned rules + SLA workflow (`workspace.sla.ts`) |

## 8. STR / CTR / FIU filing — explicit boundary

STR/CTR determination and FIU-IND filing are **legal/compliance processes** with
a named Principal Officer/Designated Director, performed by qualified
professionals. EXORA provides technical **draft assembly and export only**. **No
filing automation exists or is claimed.**

---

**No compliance/legal claim is made.** This runbook describes technical evidence
assembly to *support* a future FIU/legal review.
