# Final Cybersecurity / VAPT Evidence Pack (Stage 8)

**Status: STAGING AUDIT-FREEZE. Mode: INR_ONLY. Crypto globally disabled.**

> The single entry point for a cybersecurity auditor / VAPT tester / FIU technical
> reviewer. It ties together the Stage 8 docs, the read-only evidence script, and
> the manual runbook. **It does not claim production, FIU legal, or
> production-crypto readiness.**

---

## 1. How to collect final evidence

```powershell
# From repo root. Read-only; writes to git-ignored evidence-pack-output/.
./scripts/security/collect-final-audit-evidence.ps1 `
  -ApiBase   https://www.exorain.com/api/v1 `
  -AdminBase https://www.exorain.com/admin/v1
```

- PowerShell 5.1+ compatible. **Read-only.** Never calls `get-secret-value`,
  never prints secrets, never exports PII, never mutates AWS.
- Output: `evidence-pack-output/final-audit-<timestamp>/` with a
  `00-summary.txt` PASS/WARN/FAIL roll-up.
- Also run the peer scripts for depth (all read-only):
  - `scripts/security/collect-secrets-evidence.ps1`
  - `scripts/security/collect-edge-security-evidence.ps1`
  - `scripts/compliance/collect-fiu-technical-evidence.ps1`

## 2. What is safe to share with an auditor

- This README + the Stage 8 docs:
  [`../stage-8-final-audit-readiness.md`](../stage-8-final-audit-readiness.md),
  [`../vapt-scope.md`](../vapt-scope.md),
  [`../vapt-evidence-checklist.md`](../vapt-evidence-checklist.md),
  [`../final-security-control-matrix.md`](../final-security-control-matrix.md),
  [`../final-smoke-test-runbook.md`](../final-smoke-test-runbook.md).
- The referenced Stage 4–7 docs and
  [`../../compliance/production-blockers.md`](../../compliance/production-blockers.md).
- The read-only script outputs from `evidence-pack-output/final-audit-<ts>/`
  **after** confirming they contain no secrets/PII (they are designed not to).
- Redacted screenshots and redacted record samples.

## 3. What must NOT be shared

- ❌ Any secret, key, token, `.env`, or `get-secret-value` output.
- ❌ Real user PII or real KYC documents (redact / synthesize).
- ❌ Infra identifiers that reveal account internals beyond what the script emits
   (the `evidence-pack-output/` folder is git-ignored — hand off out of band).
- ❌ Real auditor account passwords in Git (use the OOB template).
- ❌ Any claim of production / FIU-legal / production-crypto readiness.

## 4. Folder structure

```
docs/security/
  final-evidence-pack/README.md        <- you are here
  stage-8-final-audit-readiness.md
  vapt-scope.md
  vapt-evidence-checklist.md
  final-security-control-matrix.md
  final-smoke-test-runbook.md
scripts/security/
  collect-final-audit-evidence.ps1
evidence-pack-output/                  <- git-ignored; script writes here
  final-audit-<timestamp>/
    00-summary.txt
    01-git.txt
    02-ecs.txt
    03-taskdef.txt
    04-platform-flags.txt
    05-cloudfront-s3.txt
    06-log-retention.txt
    07-alarms.txt
    08-docs-present.txt
    09-reachability.txt
    10-frontend-scan.txt
```

## 5. Screenshots to capture (redacted)

- Login page requesting location; login blocked when location denied.
- Dashboard greeting with a real name (not `trader`).
- Profile/trading/settings/active-devices showing real/empty (no fake data).
- Admin console: activity timeline, feature-controls showing crypto
  **Effective = Disabled**, `/admin/system` mode = INR_ONLY.
- CloudWatch: log-group retention (180 days) and alarms list.
- Crypto surface blocked/hidden in the user UI.

## 6. Logs to export

- CloudWatch log-group retention config (names + retention only).
- CloudWatch alarms list + states.
- Sample (redacted) audit/security-event entries showing append-only behavior.
- The `evidence-pack-output/final-audit-<ts>/` script bundle.

## 7. Recommended auditor demo flow

1. Read `stage-8-final-audit-readiness.md`, then `vapt-scope.md` (rules of engagement).
2. Run `collect-final-audit-evidence.ps1`; review `00-summary.txt`.
3. Walk `final-smoke-test-runbook.md` on `www.exorain.com`.
4. Fill `vapt-evidence-checklist.md` + `final-security-control-matrix.md` status.
5. Confirm crypto stays blocked and INR flows intact.
6. Record findings per the `vapt-scope.md` reporting format.

## 8. Known limitations

- Real KYC/liveness + sanctions/PEP/adverse-media vendors are **mock**.
- Transaction-monitoring rules not tuned on real data; no named officer.
- KMS CMK + secrets rotation not done; SIEM/tamper-resistant logging absent.
- Tuned WAF not associated to the actual serving edge; CSP report-only.
- Idle session timeout missing; audit hash-chain not populated; RDS staging
  backup retention 1 day.
- FIU registration + legal process out of scope. See
  [`../../compliance/production-blockers.md`](../../compliance/production-blockers.md).

## 9. Sign-off checklist

- [ ] Evidence script run; `00-summary.txt` reviewed; no secrets/PII present.
- [ ] INR_ONLY + crypto-off confirmed (script PASS + admin screenshot).
- [ ] Single active session + login-location verified (smoke runbook).
- [ ] Admin RBAC + lifecycle verified.
- [ ] Log retention (180d) + alarms evidenced.
- [ ] Control matrix + VAPT checklist filled.
- [ ] Gaps/blockers acknowledged in writing (not claimed as done).
- [ ] Reviewer informed: **staging readiness, not production/FIU-legal/crypto**.

> Owners/dates filled out of band. This pack prepares EXORA for an independent
> external VAPT; it is not itself a certification.
