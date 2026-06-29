<#
.SYNOPSIS
  Verify CloudWatch Logs retention for EXORA staging log groups (read-only).

.DESCRIPTION
  Stage 4 - audit evidence. Prints the current retention for each in-scope
  staging log group and flags any group whose retention is below the expected
  target. Purely read-only (describe-log-groups). Produces auditor-friendly
  output you can capture to a file.
  Compatible with Windows PowerShell 5.1 and PowerShell 7+.

.PARAMETER ExpectedDays
  The retention each group should have. Default 180 (CERT-In target).

.PARAMETER Region
  AWS region. Default ap-south-1.

.EXAMPLE
  ./verify-log-retention.ps1
  ./verify-log-retention.ps1 | Tee-Object evidence/log-retention.txt
#>
[CmdletBinding()]
param(
  [int]$ExpectedDays = 180,
  [string]$Region = 'ap-south-1'
)

# Continue (not Stop): native `aws` stderr must not abort before our own
# $LASTEXITCODE check (a Windows PowerShell 5.1 quirk). We check exit codes.
$ErrorActionPreference = 'Continue'

$logGroups = @(
  '/ecs/cex-staging/api',
  '/ecs/cex-staging/admin',
  '/ecs/cex-staging/worker',
  '/ecs/cex-staging/scanner',
  '/ecs/cex-staging/migrate',
  '/ecs/cex-staging/testnet-tools'
)

Write-Host "EXORA Stage 4 - CloudWatch log retention verification" -ForegroundColor Cyan
Write-Host "Region: $Region   Expected: >= $ExpectedDays days   Captured: $(Get-Date -Format o)"
Write-Host ""
Write-Host ("{0,-34} {1,-14} {2}" -f 'LOG GROUP','RETENTION','STATUS')
Write-Host ("-" * 70)

# Fetch all matching groups ONCE, then filter in PowerShell (no JMESPath).
$raw = aws logs describe-log-groups --log-group-name-prefix "/ecs/cex-staging" --output json --region $Region 2>$null
# PS 5.1 returns string[] from native commands; join before parsing.
$rawText = ($raw -join "`n")
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rawText)) {
  Write-Host "ERROR: describe-log-groups failed (check AWS credentials / region $Region)." -ForegroundColor Red
  exit 1
}
try { $groups = ($rawText | ConvertFrom-Json).logGroups }
catch {
  Write-Host "ERROR: could not parse describe-log-groups output as JSON." -ForegroundColor Red
  exit 1
}

$allOk = $true
foreach ($lg in $logGroups) {
  $g = $groups | Where-Object { $_.logGroupName -eq $lg }

  if ($null -eq $g) {
    Write-Host ("{0,-34} {1,-14} {2}" -f $lg,'NOT FOUND','group missing in region') -ForegroundColor Yellow
    $allOk = $false
    continue
  }

  if ($null -eq $g.retentionInDays) {
    Write-Host ("{0,-34} {1,-14} {2}" -f $lg,'NEVER','NON-COMPLIANT (never expires)') -ForegroundColor Red
    $allOk = $false
    continue
  }

  $ret = [int]$g.retentionInDays
  if ($ret -ge $ExpectedDays) {
    Write-Host ("{0,-34} {1,-14} {2}" -f $lg,"$ret days",'OK') -ForegroundColor Green
  } else {
    Write-Host ("{0,-34} {1,-14} {2}" -f $lg,"$ret days","BELOW TARGET (< $ExpectedDays)") -ForegroundColor Red
    $allOk = $false
  }
}

Write-Host ""
if ($allOk) {
  Write-Host "RESULT: all in-scope log groups meet the $ExpectedDays-day target." -ForegroundColor Green
} else {
  Write-Host "RESULT: one or more groups are non-compliant. Run set-log-retention.ps1 -Apply." -ForegroundColor Red
}
