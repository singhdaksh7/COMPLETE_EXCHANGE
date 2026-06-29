# Log Retention Runbook (Stage 4)

**Status: OPERATIONAL RUNBOOK — staging/demo (INR_ONLY).**
**Retention target: 180 days** (CERT-In Direction (iv) for ICT logs), aligned
with [`log-retention-180-days.md`](./log-retention-180-days.md). This runbook is
the *how-to*; that document is the *why* and the compliance framing.

> The Stage 4 scope prompt suggested 90 days "unless existing docs already
> specify another value." Existing docs **do** specify 180 days for CERT-In, so
> 180 is the target here. The scripts default to 180 but accept any
> CloudWatch-valid value via `-RetentionDays`.

---

## 1. Log groups in scope

The live staging ECS services write to these CloudWatch Logs groups
(`ap-south-1`):

| Log group | Source |
|---|---|
| `/ecs/cex-staging/api` | User API (Express, port 4000) |
| `/ecs/cex-staging/admin` | Admin API (Express, port 4001) |
| `/ecs/cex-staging/worker` | Background worker |
| `/ecs/cex-staging/scanner` | Chain scanner (testnet) |
| `/ecs/cex-staging/migrate` | One-shot DB migration task |
| `/ecs/cex-staging/testnet-tools` | Testnet utilities |

Logs are structured JSON (pino) with secrets/PII redacted at the logger
(`backend/src/lib/logger.ts`). Application audit trails (`audit_logs`,
`admin_logs`) live in the DB and are append-only by trigger — they are **not**
subject to CloudWatch retention and are retained per
[`record-retention-policy.md`](../compliance/record-retention-policy.md).

## 2. Retention target

- **180 days** rolling on every in-scope group.
- `put-retention-policy` only changes the **expiry window for future pruning**.
  It never deletes existing events and never deletes the log group. Lowering a
  window can cause older events to age out sooner; we only ever set ≥ current.

## 3. Verify current retention

PowerShell (Windows) — repo helper:

```powershell
./scripts/observability/verify-log-retention.ps1 -Region ap-south-1
```

Raw AWS CLI (any shell):

```bash
aws logs describe-log-groups \
  --query 'logGroups[?starts_with(logGroupName, `/ecs/cex-staging/`)].{name:logGroupName,retentionDays:retentionInDays}' \
  --output table --region ap-south-1
```

A blank/`null` `retentionDays` means **Never expire** → non-compliant for ICT logs.

## 4. Update retention safely

Dry run first (prints planned changes, no mutation):

```powershell
./scripts/observability/set-log-retention.ps1 -Region ap-south-1
```

Apply 180-day retention:

```powershell
./scripts/observability/set-log-retention.ps1 -RetentionDays 180 -Apply
```

Raw AWS CLI for a single group:

```bash
aws logs put-retention-policy \
  --log-group-name /ecs/cex-staging/api \
  --retention-in-days 180 --region ap-south-1
```

The script **never creates or deletes** a log group — groups that are missing in
the region are skipped with a `[SKIP]` note. Re-run the verifier afterward.

## 5. Export logs for an auditor

Export a date range to S3 (recommended for evidence hand-off). Requires an S3
bucket the CloudWatch Logs service can write to (bucket policy granting
`logs.ap-south-1.amazonaws.com`):

```bash
# Epoch millis for the window you need:
aws logs create-export-task \
  --log-group-name /ecs/cex-staging/api \
  --from 1719619200000 --to 1719705600000 \
  --destination <evidence-bucket> \
  --destination-prefix exora/api/2026-06-29 \
  --region ap-south-1
```

For ad-hoc/recent slices without S3, filter to a local file (already redacted at
source):

```bash
aws logs filter-log-events --log-group-name /ecs/cex-staging/api \
  --start-time $(($(date +%s)-3600))000 \
  --filter-pattern '{ $.level = "error" }' \
  --region ap-south-1 --query 'events[].message' --output text > api-errors.txt
```

After export, **record the SHA-256 of each exported file** and the operator +
timestamp (CERT-In evidence-integrity expectation):

```bash
sha256sum api-errors.txt
```

## 6. Evidence to save

- `verify-log-retention.ps1` output (or the `describe-log-groups` table) showing
  `retentionDays = 180` on every in-scope group.
- Date applied + operator (who ran `set-log-retention.ps1 -Apply`).
- For any export: bucket/prefix, time range, and SHA-256 of exported files.
- Capture into the evidence pack: `evidence-pack-output/<stamp>/03-log-retention.txt`
  (produced by `collect-evidence.ps1`).

## 7. Known limitations / production blockers

- Retention is set **imperatively** (CLI/script), not codified in IaC, so it can
  drift. Future hardening: Terraform `aws_cloudwatch_log_group.retention_in_days`
  (see [`cloudwatch-alarms-plan.md`](./cloudwatch-alarms-plan.md) §IaC).
- No tamper-resistant centralized store yet (e.g. S3 Object Lock / SIEM) — the
  180 days currently rely on CloudWatch + manual export. Tracked in
  [`production-blockers.md`](../compliance/production-blockers.md).
- NTP/time-sync assurance across hosts is not yet verified (CERT-In iii).

> Do not claim CERT-In log-retention compliance until retention is 180 days on
> every in-scope group, time-sync is enabled, and centralized tamper-resistant
> retention is in place.
