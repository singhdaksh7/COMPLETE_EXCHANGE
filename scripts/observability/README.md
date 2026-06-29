# Observability scripts (Stage 4)

Staging-safe PowerShell helpers for CloudWatch log retention, alarms, and audit
evidence collection. **Windows PowerShell 7+ / `pwsh`.** All require the AWS CLI
configured with appropriate permissions; region defaults to `ap-south-1`.

These scripts change **only** CloudWatch Logs retention and CloudWatch alarms.
They never touch application code, the matching engine, the ledger, INR
deposit/withdrawal logic, withdrawal signing, or feature flags. Two of them are
**read-only**; the two that mutate are **dry-run by default** and require
`-Apply`.

| Script | Mutates? | Purpose |
|---|---|---|
| `set-log-retention.ps1` | Yes (`-Apply`) | Set 180-day retention on `/ecs/cex-staging/*` log groups. Never creates/deletes groups or logs. |
| `verify-log-retention.ps1` | No | Report current retention; flag groups below target. |
| `create-cloudwatch-alarms.ps1` | Yes (`-Apply`) | Create metric filters + alarms (5xx, DB errors, latency, 404, admin auth-fail, ECS running-count, ALB). |
| `collect-evidence.ps1` | No | Gather read-only AWS + git evidence into a timestamped folder. |

## Quick start

```powershell
# 1. Check current retention
./scripts/observability/verify-log-retention.ps1

# 2. Apply 180-day retention (dry run first without -Apply)
./scripts/observability/set-log-retention.ps1 -Apply

# 3. Create alarms (dry run first; add -SnsTopicArn / -AlbTargetGroup when ready)
./scripts/observability/create-cloudwatch-alarms.ps1            # dry run
./scripts/observability/create-cloudwatch-alarms.ps1 -Apply

# 4. Collect evidence
./scripts/observability/collect-evidence.ps1 -EcrRepo cex-staging-backend -RdsInstanceId cex-staging-db -CloudFrontId <ID>
```

Related docs: [`../../docs/security/log-retention-runbook.md`](../../docs/security/log-retention-runbook.md),
[`../../docs/security/cloudwatch-alarms-plan.md`](../../docs/security/cloudwatch-alarms-plan.md),
[`../../docs/security/alert-runbook.md`](../../docs/security/alert-runbook.md),
[`../../docs/security/evidence-pack/README.md`](../../docs/security/evidence-pack/README.md).

> Evidence output (`evidence-pack-output/`) is git-ignored — it may contain infra
> identifiers. Hand it to the auditor out of band; do not commit it.
