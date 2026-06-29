# CloudWatch Alarms Plan (Stage 4)

**Status: PLAN + STAGING-SAFE SCRIPT — not a SIEM.**
**Mode: INR_ONLY staging/demo.** These alarms are best-effort detection over
CloudWatch Logs/metrics. They do **not** replace the centralized SIEM alerting
that remains a production blocker
([`production-blockers.md`](../compliance/production-blockers.md),
[`cert-in-incident-response.md`](./cert-in-incident-response.md) "Readiness gaps").

The repo has **no IaC** today, so alarms are created by an idempotent,
dry-run-by-default script:
[`scripts/observability/create-cloudwatch-alarms.ps1`](../../scripts/observability/create-cloudwatch-alarms.ps1).
A Terraform-ready equivalent is in §6 for when IaC is adopted.

---

## 1. Log shape the filters rely on (verified)

- pino emits **string** levels: `{"level":"error", ...}` — `formatters.level`
  in `backend/src/lib/logger.ts`.
- pino-http logs each request with `res.statusCode` and `responseTime` (ms),
  and escalates level by status (`>=500 → error`, `>=400 → warn`) —
  `backend/src/app.ts`, `backend/src/admin-app.ts`.
- The central error handler logs `"Prisma known request error"` for the
  `DB_REQUEST_ERROR` response path — `backend/src/middleware/error-handler.ts`.

If the deployed log format ever changes, re-validate each filter pattern with
`aws logs filter-log-events` before trusting the alarm.

## 2. Metric filters (on `/ecs/cex-staging/{api,admin}`)

| Filter | Pattern | Metric (`EXORA/Staging`) |
|---|---|---|
| API 5xx | `{ $.res.statusCode >= 500 }` | `Api5xx` |
| API error-level | `{ $.level = "error" }` | `ApiErrorLevel` |
| API Prisma/DB error | `{ $.msg = "Prisma known request error" }` | `ApiPrismaError` |
| API slow request | `{ $.responseTime > 2000 }` | `ApiSlowRequest` |
| API 404 | `{ $.res.statusCode = 404 }` | `Api404` |
| Admin 5xx | `{ $.res.statusCode >= 500 }` | `Admin5xx` |
| Admin error-level | `{ $.level = "error" }` | `AdminErrorLevel` |
| Admin auth failure | `{ $.res.statusCode = 401 }` | `AdminAuthFailure` |

## 3. Alarms

### Log-metric alarms (period 300s unless noted)

| Alarm | Metric | Condition | Meaning |
|---|---|---|---|
| `cex-staging-api-5xx` | `Api5xx` | Sum > 5 / 5m | API server errors |
| `cex-staging-api-error-level` | `ApiErrorLevel` | Sum > 20 / 5m | Error-log surge |
| `cex-staging-api-prisma-err` | `ApiPrismaError` | Sum > 3 / 5m | DB request errors |
| `cex-staging-api-latency` | `ApiSlowRequest` | Sum > 10 / 5m ×2 | Latency degradation |
| `cex-staging-api-404` | `Api404` | Sum > 50 / 5m | Route scanning / 404 flood |
| `cex-staging-admin-5xx` | `Admin5xx` | Sum > 3 / 5m | Admin server errors |
| `cex-staging-admin-error-level` | `AdminErrorLevel` | Sum > 10 / 5m | Admin error surge |
| `cex-staging-admin-auth-fail` | `AdminAuthFailure` | Sum > 10 / 5m | Admin login-failure spike (brute-force proxy) |

### Infra alarms (AWS-native metrics)

| Alarm | Namespace/metric | Condition | Notes |
|---|---|---|---|
| `cex-staging-<svc>-running-count-low` | `ECS/ContainerInsights` / `RunningTaskCount` | Min < 1 / 60s ×3 | One per api/admin/worker/scanner. **Requires Container Insights**; otherwise INSUFFICIENT_DATA (harmless). |
| `cex-staging-alb-unhealthy-hosts` | `AWS/ApplicationELB` / `UnHealthyHostCount` | Max ≥ 1 / 60s ×3 | Needs `-AlbTargetGroup` + `-AlbArnSuffix`. |
| `cex-staging-alb-target-5xx` | `AWS/ApplicationELB` / `HTTPCode_Target_5XX_Count` | Sum > 5 / 5m | Edge-level 5xx. |
| `cex-staging-alb-latency-p95` | `AWS/ApplicationELB` / `TargetResponseTime` | p95 > 2s / 5m ×2 | Edge latency. |

> **Thresholds are starting points for staging.** Tune against a baseline before
> wiring paging. `treat-missing-data` is `notBreaching` for log metrics and
> `breaching` for ECS running-count (no tasks = real problem).

## 4. Auth-failure / lockout detection — important caveat

The **authoritative** record of user/admin auth failures and lockouts is the
append-only DB audit trail (`audit_logs`/`admin_logs`, action codes
`auth.login_failed`, `auth.login_locked`, `auth.token_reuse_detected`,
`auth.otp_locked` — `backend/src/lib/audit.ts`). The CloudWatch alarms above use
HTTP-status **proxies** (e.g. admin 401 spike) because the DB trail is not
shipped to CloudWatch metrics. True auth-anomaly alerting requires the SIEM
(production blocker). Treat these alarms as early-warning, not as the system of
record.

## 5. Apply / verify

```powershell
# Dry run (prints every aws command, no changes):
./scripts/observability/create-cloudwatch-alarms.ps1

# Create filters + alarms (no notifications yet):
./scripts/observability/create-cloudwatch-alarms.ps1 -Apply

# With an existing SNS topic for email/paging:
./scripts/observability/create-cloudwatch-alarms.ps1 -Apply `
  -SnsTopicArn arn:aws:sns:ap-south-1:<ACCOUNT_ID>:cex-staging-alerts

# With ALB dimensions:
./scripts/observability/create-cloudwatch-alarms.ps1 -Apply `
  -AlbTargetGroup targetgroup/<name>/<id> -AlbArnSuffix app/<alb>/<id>
```

Verify:

```bash
aws cloudwatch describe-alarms --alarm-name-prefix cex-staging \
  --query 'MetricAlarms[].{name:AlarmName,state:StateValue}' --output table --region ap-south-1
aws logs describe-metric-filters --log-group-name /ecs/cex-staging/api --region ap-south-1
```

### SNS notification topic (placeholder — do not hardcode personal email)

```bash
# Create topic and subscribe an email (replace with the team alias out-of-band):
aws sns create-topic --name cex-staging-alerts --region ap-south-1
aws sns subscribe --topic-arn arn:aws:sns:ap-south-1:<ACCOUNT_ID>:cex-staging-alerts \
  --protocol email --notification-endpoint <ALERTS_EMAIL_PLACEHOLDER> --region ap-south-1
```

> Use a team/distribution alias, never a personal address. No emails or secrets
> are committed to the repo.

## 6. Terraform-ready reference (for future IaC)

When IaC is adopted, codify the above so it cannot drift. Example shape:

```hcl
locals {
  region    = "ap-south-1"
  namespace = "EXORA/Staging"
  log_groups = {
    api   = "/ecs/cex-staging/api"
    admin = "/ecs/cex-staging/admin"
  }
}

resource "aws_cloudwatch_log_metric_filter" "api_5xx" {
  name           = "cex-staging-api-5xx"
  log_group_name = local.log_groups.api
  pattern        = "{ $.res.statusCode >= 500 }"
  metric_transformation {
    name          = "Api5xx"
    namespace     = local.namespace
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "cex-staging-api-5xx"
  namespace           = local.namespace
  metric_name         = "Api5xx"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_sns_topic_arn] # variable, not a literal
}

# Retention codified alongside (replaces the imperative script):
resource "aws_cloudwatch_log_group" "api" {
  name              = local.log_groups.api
  retention_in_days = 180
}
```

> Do not commit a real account id, SNS ARN, or email into Terraform — use
> `variables.tf` + a git-ignored `*.tfvars`.

## 7. Known limitations

- Best-effort, log/metric-based — **not** a SIEM; no correlation, enrichment, or
  automated response.
- ECS running-count alarms need Container Insights enabled on the cluster.
- ALB alarms need the environment-specific target-group / load-balancer
  dimensions supplied.
- Thresholds are un-baselined defaults; tune before enabling paging.
