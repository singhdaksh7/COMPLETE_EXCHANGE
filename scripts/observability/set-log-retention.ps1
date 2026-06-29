<#
.SYNOPSIS
  Set CloudWatch Logs retention for EXORA staging log groups.

.DESCRIPTION
  Stage 4 - safe observability. Sets a retention policy (default 180 days, to
  match docs/security/log-retention-180-days.md / CERT-In) on the known
  staging log groups. This NEVER deletes a log group and NEVER deletes log
  events - put-retention-policy only changes the expiry window for FUTURE
  pruning. Existing events are retained until they age past the new window.

  Read-only by default: prints what it WOULD do. Pass -Apply to make changes.
  Compatible with Windows PowerShell 5.1 and PowerShell 7+.

.PARAMETER RetentionDays
  Retention in days. Must be a value CloudWatch accepts. Default 180.

.PARAMETER Region
  AWS region. Default ap-south-1 (Mumbai - Indian jurisdiction, CERT-In).

.PARAMETER Apply
  Actually call put-retention-policy. Omit for a dry run.

.EXAMPLE
  ./set-log-retention.ps1                 # dry run, shows planned changes
  ./set-log-retention.ps1 -Apply          # apply 180-day retention
  ./set-log-retention.ps1 -RetentionDays 90 -Apply
#>
[CmdletBinding()]
param(
  [int]$RetentionDays = 180,
  [string]$Region = 'ap-south-1',
  [switch]$Apply
)

# Use Continue (not Stop): native `aws` writes to stderr on benign warnings and
# on credential errors. Under 'Stop' that stderr becomes a terminating error in
# Windows PowerShell 5.1 BEFORE our own $LASTEXITCODE check runs. We check exit
# codes explicitly instead. The `throw` statements below still terminate.
$ErrorActionPreference = 'Continue'

# CloudWatch Logs only accepts these discrete retention values.
$validRetentions = @(1,3,5,7,14,30,60,90,120,150,180,365,400,545,731,1096,1827,2192,2557,2922,3288,3653)
if ($validRetentions -notcontains $RetentionDays) {
  throw "RetentionDays=$RetentionDays is not a CloudWatch-accepted value. Allowed: $($validRetentions -join ', ')"
}

# Known EXORA staging log groups (Stage 4 scope). Do NOT create/delete groups.
$logGroups = @(
  '/ecs/cex-staging/api',
  '/ecs/cex-staging/admin',
  '/ecs/cex-staging/worker',
  '/ecs/cex-staging/scanner',
  '/ecs/cex-staging/migrate',
  '/ecs/cex-staging/testnet-tools'
)

Write-Host "EXORA Stage 4 - set CloudWatch log retention" -ForegroundColor Cyan
Write-Host "Region:        $Region"
Write-Host "RetentionDays: $RetentionDays"
Write-Host "Mode:          $(if ($Apply) { 'APPLY' } else { 'DRY RUN (no changes)' })"
Write-Host ""

# Fetch all matching groups ONCE, then filter in PowerShell. Avoids JMESPath
# pipe/[0] expressions that confuse the Windows PowerShell 5.1 parser.
$raw = aws logs describe-log-groups --log-group-name-prefix "/ecs/cex-staging" --output json --region $Region 2>$null
# In PS 5.1 a native command returns string[] (one line per element); join into
# a single string before parsing so ConvertFrom-Json sees one JSON document.
$rawText = ($raw -join "`n")
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rawText)) {
  throw "describe-log-groups failed (check AWS credentials / region $Region)."
}
try { $groups = ($rawText | ConvertFrom-Json).logGroups }
catch { throw "Could not parse describe-log-groups output as JSON." }

foreach ($lg in $logGroups) {
  $g = $groups | Where-Object { $_.logGroupName -eq $lg }

  if ($null -eq $g) {
    Write-Host "[SKIP] $lg - not found in $Region (not creating it)." -ForegroundColor Yellow
    continue
  }

  $current = if ($null -eq $g.retentionInDays) { 'Never expire' } else { "$($g.retentionInDays) days" }

  if ($Apply) {
    aws logs put-retention-policy `
      --log-group-name $lg `
      --retention-in-days $RetentionDays `
      --region $Region
    Write-Host "[SET ] $lg : $current -> $RetentionDays days" -ForegroundColor Green
  } else {
    Write-Host "[PLAN] $lg : $current -> $RetentionDays days" -ForegroundColor Gray
  }
}

Write-Host ""
Write-Host "Done. Verify with: ./verify-log-retention.ps1 -Region $Region" -ForegroundColor Cyan
if (-not $Apply) { Write-Host "Re-run with -Apply to make changes." -ForegroundColor Yellow }
