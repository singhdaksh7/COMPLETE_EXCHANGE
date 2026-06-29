<#
.SYNOPSIS
  Create CloudWatch metric filters + alarms for EXORA staging (Stage 4).

.DESCRIPTION
  Staging-safe observability. Creates:
    1. Log metric filters on /ecs/cex-staging/{api,admin} that turn structured
       pino/pino-http JSON log lines into CloudWatch metrics.
    2. Metric alarms over those metrics (5xx, error-level, Prisma DB errors,
       high latency, 404 spikes, admin auth-failure proxy).
    3. ECS service running-count alarms (RunningTaskCount < 1) - requires ECS
       Container Insights; harmlessly INSUFFICIENT_DATA if not enabled.
    4. ALB target-health / latency / 5xx alarms - ONLY if -AlbTargetGroup and
       -AlbArnSuffix are supplied (dimensions are environment-specific).

  Metric-filter patterns are grounded in the real log shape:
    - pino emits string levels:           {"level":"error", ...}    (logger.ts)
    - pino-http logs res.statusCode and responseTime (ms) per request (app.ts)
    - error-handler logs "Prisma known request error" for DB_REQUEST_ERROR
      responses (error-handler.ts)

  NOTHING here changes application behaviour. Read-only by default - pass
  -Apply to create resources. Notification wiring is optional: pass
  -SnsTopicArn to attach an existing SNS topic, otherwise alarms are created
  WITHOUT actions (visible in console; no email until a topic is attached).

.PARAMETER Region        AWS region. Default ap-south-1.
.PARAMETER MetricNamespace  Custom metric namespace. Default EXORA/Staging.
.PARAMETER SnsTopicArn   Optional existing SNS topic ARN for alarm actions.
.PARAMETER AlbTargetGroup  Optional ALB TargetGroup dimension (e.g. targetgroup/cex-staging-api/abc123).
.PARAMETER AlbArnSuffix   Optional LoadBalancer dimension (e.g. app/cex-staging-alb/def456).
.PARAMETER Apply         Actually create resources. Omit for dry run.

.EXAMPLE
  ./create-cloudwatch-alarms.ps1                       # dry run
  ./create-cloudwatch-alarms.ps1 -Apply
  ./create-cloudwatch-alarms.ps1 -Apply -SnsTopicArn arn:aws:sns:ap-south-1:<ACCOUNT_ID>:cex-staging-alerts
#>
[CmdletBinding()]
param(
  [string]$Region = 'ap-south-1',
  [string]$MetricNamespace = 'EXORA/Staging',
  [string]$SnsTopicArn = '',          # placeholder - leave empty if no SNS yet
  [string]$AlbTargetGroup = '',       # e.g. targetgroup/<name>/<id>
  [string]$AlbArnSuffix = '',         # e.g. app/<alb-name>/<id>
  [string]$EcsCluster = 'cex-staging',
  [switch]$Apply
)

# Continue (not Stop): a benign aws stderr warning must not abort the whole run
# mid-apply. We report each call's exit code explicitly instead.
$ErrorActionPreference = 'Continue'

# Windows PowerShell 5.1 (and PS7 with PSNativeCommandArgumentPassing=Legacy) do
# NOT escape embedded double-quotes when invoking a native exe, so a filter
# pattern like { $.msg = "Prisma known request error" } gets split on the spaces
# inside the quotes and aws.exe sees bogus options. Under legacy passing we must
# pre-escape each embedded " as \" so each value reaches aws as ONE argument.
# PS7 'Standard'/'Windows' passing handles quoting itself, so we must NOT escape
# there (it would pass a literal backslash-quote).
$argMode = [string](Get-Variable PSNativeCommandArgumentPassing -ValueOnly -ErrorAction SilentlyContinue)
$useLegacyQuoteEscape = [string]::IsNullOrEmpty($argMode) -or $argMode -eq 'Legacy'

# Quote an argument for the dry-run PLAN line so the printed command is readable
# and copy-paste-runnable (wrap anything with spaces/quotes; escape inner quotes).
function Format-ArgForDisplay {
  param([string]$a)
  if ($a -match '[\s"]') { '"' + ($a -replace '"','\"') + '"' } else { $a }
}

function Invoke-Aws {
  param([string[]]$ArgList, [string]$Label)
  if ($Apply) {
    # Array-based invocation (no single command string, no Invoke-Expression).
    $callArgs = if ($useLegacyQuoteEscape) { @($ArgList | ForEach-Object { $_ -replace '"','\"' }) } else { $ArgList }
    & aws @callArgs --region $Region | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "[CREATE] $Label" -ForegroundColor Green
    } else {
      Write-Host "[ERROR ] aws exited $LASTEXITCODE for: $Label" -ForegroundColor Red
    }
  } else {
    $shown = (($ArgList | ForEach-Object { Format-ArgForDisplay $_ }) -join ' ')
    Write-Host "[PLAN]   $Label" -ForegroundColor Gray
    Write-Host "         aws $shown --region $Region" -ForegroundColor DarkGray
  }
}

$alarmActions = @()
if (-not [string]::IsNullOrWhiteSpace($SnsTopicArn)) { $alarmActions = @('--alarm-actions', $SnsTopicArn, '--ok-actions', $SnsTopicArn) }

Write-Host "EXORA Stage 4 - CloudWatch metric filters + alarms" -ForegroundColor Cyan
Write-Host "Region: $Region   Namespace: $MetricNamespace   Mode: $(if ($Apply){'APPLY'}else{'DRY RUN'})"
if ([string]::IsNullOrWhiteSpace($SnsTopicArn)) {
  Write-Host "SNS: none provided - alarms created WITHOUT notification actions (placeholder)." -ForegroundColor Yellow
}
Write-Host ""

# ---------------------------------------------------------------------------
# 1) Metric filters: (logGroup, filterName, metricName, filterPattern)
# ---------------------------------------------------------------------------
$filters = @(
  @{ lg='/ecs/cex-staging/api';   name='cex-staging-api-5xx';        metric='Api5xx';          pattern='{ $.res.statusCode >= 500 }' },
  @{ lg='/ecs/cex-staging/api';   name='cex-staging-api-error-level'; metric='ApiErrorLevel';   pattern='{ $.level = "error" }' },
  @{ lg='/ecs/cex-staging/api';   name='cex-staging-api-prisma-err'; metric='ApiPrismaError';  pattern='{ $.msg = "Prisma known request error" }' },
  @{ lg='/ecs/cex-staging/api';   name='cex-staging-api-latency';    metric='ApiSlowRequest';  pattern='{ $.responseTime > 2000 }' },
  @{ lg='/ecs/cex-staging/api';   name='cex-staging-api-404';        metric='Api404';          pattern='{ $.res.statusCode = 404 }' },
  @{ lg='/ecs/cex-staging/admin'; name='cex-staging-admin-5xx';      metric='Admin5xx';        pattern='{ $.res.statusCode >= 500 }' },
  @{ lg='/ecs/cex-staging/admin'; name='cex-staging-admin-error-level'; metric='AdminErrorLevel'; pattern='{ $.level = "error" }' },
  @{ lg='/ecs/cex-staging/admin'; name='cex-staging-admin-auth-fail'; metric='AdminAuthFailure'; pattern='{ $.res.statusCode = 401 }' }
)

Write-Host "## Metric filters" -ForegroundColor Cyan
foreach ($f in $filters) {
  $transform = "metricName=$($f.metric),metricNamespace=$MetricNamespace,metricValue=1,defaultValue=0"
  Invoke-Aws -Label "filter $($f.name) on $($f.lg) -> $MetricNamespace/$($f.metric)" -ArgList @(
    'logs','put-metric-filter',
    '--log-group-name', $f.lg,
    '--filter-name', $f.name,
    '--filter-pattern', $f.pattern,
    '--metric-transformations', $transform
  )
}

# ---------------------------------------------------------------------------
# 2) Alarms over the metric-filter metrics
#    (metricName, alarm suffix, threshold, evalPeriods, periodSec, comparison, statistic, description)
# ---------------------------------------------------------------------------
$metricAlarms = @(
  @{ metric='Api5xx';         name='cex-staging-api-5xx';         threshold=5;  periods=1; period=300; cmp='GreaterThanThreshold'; stat='Sum';  desc='API 5xx responses spiking' },
  @{ metric='ApiErrorLevel';  name='cex-staging-api-error-level'; threshold=20; periods=1; period=300; cmp='GreaterThanThreshold'; stat='Sum';  desc='API error-level log spike' },
  @{ metric='ApiPrismaError'; name='cex-staging-api-prisma-err';  threshold=3;  periods=1; period=300; cmp='GreaterThanThreshold'; stat='Sum';  desc='Prisma/DB_REQUEST_ERROR spike' },
  @{ metric='ApiSlowRequest'; name='cex-staging-api-latency';     threshold=10; periods=2; period=300; cmp='GreaterThanThreshold'; stat='Sum';  desc='High API response latency (>2s)' },
  @{ metric='Api404';         name='cex-staging-api-404';         threshold=50; periods=1; period=300; cmp='GreaterThanThreshold'; stat='Sum';  desc='404 spike (route scanning proxy)' },
  @{ metric='Admin5xx';       name='cex-staging-admin-5xx';       threshold=3;  periods=1; period=300; cmp='GreaterThanThreshold'; stat='Sum';  desc='Admin 5xx responses spiking' },
  @{ metric='AdminErrorLevel';name='cex-staging-admin-error-level'; threshold=10; periods=1; period=300; cmp='GreaterThanThreshold'; stat='Sum'; desc='Admin error-level log spike' },
  @{ metric='AdminAuthFailure'; name='cex-staging-admin-auth-fail'; threshold=10; periods=1; period=300; cmp='GreaterThanThreshold'; stat='Sum'; desc='Admin auth-failure (401) spike - proxy for brute force' }
)

Write-Host ""
Write-Host "## Metric-filter alarms" -ForegroundColor Cyan
foreach ($a in $metricAlarms) {
  Invoke-Aws -Label "alarm $($a.name) [$($a.metric) $($a.cmp) $($a.threshold)]" -ArgList (@(
    'cloudwatch','put-metric-alarm',
    '--alarm-name', $a.name,
    '--alarm-description', $a.desc,
    '--namespace', $MetricNamespace,
    '--metric-name', $a.metric,
    '--statistic', $a.stat,
    '--period', "$($a.period)",
    '--evaluation-periods', "$($a.periods)",
    '--threshold', "$($a.threshold)",
    '--comparison-operator', $a.cmp,
    '--treat-missing-data', 'notBreaching'
  ) + $alarmActions)
}

# ---------------------------------------------------------------------------
# 3) ECS service running-count alarms (RunningTaskCount < 1)
#    Requires ECS Container Insights metrics (ECS/ContainerInsights namespace).
# ---------------------------------------------------------------------------
$ecsServices = @('cex-staging-api','cex-staging-admin','cex-staging-worker','cex-staging-scanner')
Write-Host ""
Write-Host "## ECS running-count alarms (needs Container Insights)" -ForegroundColor Cyan
foreach ($svc in $ecsServices) {
  Invoke-Aws -Label "alarm $svc-running-count-low [RunningTaskCount < 1]" -ArgList (@(
    'cloudwatch','put-metric-alarm',
    '--alarm-name', "$svc-running-count-low",
    '--alarm-description', "$svc has fewer than 1 running task",
    '--namespace', 'ECS/ContainerInsights',
    '--metric-name', 'RunningTaskCount',
    '--dimensions', "Name=ClusterName,Value=$EcsCluster", "Name=ServiceName,Value=$svc",
    '--statistic', 'Minimum',
    '--period', '60',
    '--evaluation-periods', '3',
    '--threshold', '1',
    '--comparison-operator', 'LessThanThreshold',
    '--treat-missing-data', 'breaching'
  ) + $alarmActions)
}

# ---------------------------------------------------------------------------
# 4) ALB alarms - only if dimensions supplied
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "## ALB alarms" -ForegroundColor Cyan
if ([string]::IsNullOrWhiteSpace($AlbTargetGroup) -or [string]::IsNullOrWhiteSpace($AlbArnSuffix)) {
  Write-Host "[SKIP] ALB alarms - provide -AlbTargetGroup and -AlbArnSuffix to enable." -ForegroundColor Yellow
  Write-Host "       Find them:  aws elbv2 describe-target-groups --region $Region" -ForegroundColor DarkGray
  Write-Host "                   aws elbv2 describe-load-balancers --region $Region" -ForegroundColor DarkGray
} else {
  $albDims = @('Name=TargetGroup,Value=' + $AlbTargetGroup, 'Name=LoadBalancer,Value=' + $AlbArnSuffix)

  Invoke-Aws -Label 'alarm cex-staging-alb-unhealthy-hosts [UnHealthyHostCount >= 1]' -ArgList (@(
    'cloudwatch','put-metric-alarm',
    '--alarm-name','cex-staging-alb-unhealthy-hosts',
    '--alarm-description','ALB target group has unhealthy hosts',
    '--namespace','AWS/ApplicationELB','--metric-name','UnHealthyHostCount',
    '--dimensions') + $albDims + @(
    '--statistic','Maximum','--period','60','--evaluation-periods','3',
    '--threshold','1','--comparison-operator','GreaterThanOrEqualToThreshold',
    '--treat-missing-data','notBreaching') + $alarmActions)

  Invoke-Aws -Label 'alarm cex-staging-alb-target-5xx [HTTPCode_Target_5XX_Count > 5]' -ArgList (@(
    'cloudwatch','put-metric-alarm',
    '--alarm-name','cex-staging-alb-target-5xx',
    '--alarm-description','ALB target 5xx spiking',
    '--namespace','AWS/ApplicationELB','--metric-name','HTTPCode_Target_5XX_Count',
    '--dimensions') + $albDims + @(
    '--statistic','Sum','--period','300','--evaluation-periods','1',
    '--threshold','5','--comparison-operator','GreaterThanThreshold',
    '--treat-missing-data','notBreaching') + $alarmActions)

  Invoke-Aws -Label 'alarm cex-staging-alb-latency-p95 [TargetResponseTime p95 > 2s]' -ArgList (@(
    'cloudwatch','put-metric-alarm',
    '--alarm-name','cex-staging-alb-latency-p95',
    '--alarm-description','ALB p95 target response time > 2s',
    '--namespace','AWS/ApplicationELB','--metric-name','TargetResponseTime',
    '--dimensions') + $albDims + @(
    '--extended-statistic','p95','--period','300','--evaluation-periods','2',
    '--threshold','2','--comparison-operator','GreaterThanThreshold',
    '--treat-missing-data','notBreaching') + $alarmActions)
}

Write-Host ""
Write-Host "Done. List alarms:  aws cloudwatch describe-alarms --alarm-name-prefix cex-staging --region $Region" -ForegroundColor Cyan
if (-not $Apply) { Write-Host "Re-run with -Apply to create resources." -ForegroundColor Yellow }
