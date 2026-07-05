<#
.SYNOPSIS
  Collect READ-ONLY FIU technical-readiness evidence (Stage 7).

.DESCRIPTION
  Gathers safe, non-PII evidence that EXORA has the technical foundation for
  KYC/AML/audit/record-keeping, and proves INR_ONLY / crypto-disabled posture.

  HARD RULES (by construction):
    * Read-only. No AWS resource is created or modified.
    * NEVER prints secrets; NEVER calls get-secret-value.
    * Does NOT query or export user PII. Only reads a WHITELIST of non-secret
      feature-flag env names+values from the task definition.
    * No aggressive scanning, no brute force, no real credentials.

  Compatible with Windows PowerShell 5.1 and PowerShell 7+. Pure ASCII.
  Output: evidence-pack-output/fiu-technical-<timestamp>/.

.PARAMETER Region   AWS region. Default ap-south-1.
.PARAMETER Profile  AWS profile. Default cex-staging (cleared with '').
.PARAMETER ApiBase  Optional user API base (https://host/api/v1) for safe health + crypto-gate checks.
.PARAMETER AdminBase Optional admin API base (https://host/admin/v1) for a safe 401/403 check.

.EXAMPLE
  ./collect-fiu-technical-evidence.ps1
  ./collect-fiu-technical-evidence.ps1 -ApiBase https://host/api/v1 -AdminBase https://host/admin/v1
#>
[CmdletBinding()]
param(
  [string]$Region = 'ap-south-1',
  [string]$Profile = 'cex-staging',
  [string]$ApiBase = '',
  [string]$AdminBase = ''
)

$ErrorActionPreference = 'Continue'

$awsTail = @('--region', $Region)
if (-not [string]::IsNullOrWhiteSpace($Profile)) { $awsTail += @('--profile', $Profile) }

# Repo root is two levels up from this script (scripts/compliance/).
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssZ')
$OutDir = Join-Path $repoRoot "evidence-pack-output/fiu-technical-$stamp"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Only these NON-SECRET flag names are read for their VALUES. Anything else from
# the task-def environment is read by NAME only (never value).
$nonSecretFlags = @(
  'APP_ENV','CRYPTO_DEPOSITS_GLOBAL_ENABLED','CRYPTO_WITHDRAWALS_GLOBAL_ENABLED',
  'CRYPTO_WALLET_GLOBAL_ENABLED','INR_DEPOSITS_GLOBAL_ENABLED',
  'INR_WITHDRAWALS_GLOBAL_ENABLED','TRADING_GLOBAL_ENABLED','CRYPTO_DEPOSITS_ENABLED'
)
$logGroups = @('/ecs/cex-staging/api','/ecs/cex-staging/admin','/ecs/cex-staging/worker','/ecs/cex-staging/scanner','/ecs/cex-staging/migrate','/ecs/cex-staging/testnet-tools')

$findings = New-Object System.Collections.ArrayList
function Add-Finding { param([ValidateSet('PASS','WARN','FAIL')][string]$Level,[string]$Message) [void]$findings.Add([pscustomobject]@{Level=$Level;Message=$Message}) }
function Invoke-AwsJson {
  param([string[]]$ArgList)
  $raw = & aws @ArgList @awsTail --output json 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  $text = ($raw -join "`n"); if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  try { return ($text | ConvertFrom-Json) } catch { return $null }
}
function Get-Status { param([string]$Url) return (& curl.exe -sS -o /dev/null -w "%{http_code}" --max-time 20 $Url 2>$null) }

Write-Host "EXORA Stage 7 - FIU technical evidence (READ-ONLY, no PII/secrets) -> $OutDir" -ForegroundColor Green
Write-Host "Region: $Region  Profile: '$Profile'" -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# 1) ECS service / task definition references + platform mode + crypto flags
# ---------------------------------------------------------------------------
Write-Host "[1] ECS + platform mode / crypto flags..." -ForegroundColor Cyan
$modePath = Join-Path $OutDir '01-platform-mode.txt'
"# Platform mode + crypto flags (non-secret) - captured $(Get-Date -Format o)" | Out-File $modePath -Encoding ascii
$svcJson = Invoke-AwsJson @('ecs','describe-services','--cluster','cex-staging','--services','cex-staging-api','cex-staging-admin')
if ($null -ne $svcJson -and $null -ne $svcJson.services) {
  foreach ($s in $svcJson.services) { "$($s.serviceName): running=$($s.runningCount) desired=$($s.desiredCount) taskDef=$($s.taskDefinition)" | Out-File $modePath -Encoding ascii -Append }
}
$td = Invoke-AwsJson @('ecs','describe-task-definition','--task-definition','cex-staging-api')
$cryptoOn = $false; $sawFlags = $false
if ($null -ne $td -and $null -ne $td.taskDefinition) {
  $envArr = @(); if ($td.taskDefinition.containerDefinitions[0].environment) { $envArr = @($td.taskDefinition.containerDefinitions[0].environment) }
  "--- non-secret feature flags (whitelisted names + values) ---" | Out-File $modePath -Encoding ascii -Append
  foreach ($name in $nonSecretFlags) {
    $entry = $envArr | Where-Object { $_.name -eq $name } | Select-Object -First 1
    if ($null -ne $entry) {
      $sawFlags = $true
      "$($entry.name) = $($entry.value)" | Out-File $modePath -Encoding ascii -Append
      if ($name -like 'CRYPTO_*_GLOBAL_ENABLED' -and ([string]$entry.value).ToLower() -eq 'true') { $cryptoOn = $true }
    } else {
      "$name = (absent -> default)" | Out-File $modePath -Encoding ascii -Append
    }
  }
  "--- all env var NAMES (values NOT shown) ---" | Out-File $modePath -Encoding ascii -Append
  ($envArr | ForEach-Object { $_.name }) -join ', ' | Out-File $modePath -Encoding ascii -Append
  Add-Finding PASS "Read ECS task definition env (whitelisted flag values only; all other names only)."
} else {
  "ERROR: could not read task definition." | Out-File $modePath -Encoding ascii -Append
  Add-Finding WARN "Could not read cex-staging-api task definition (credentials/permissions?)."
}
if ($cryptoOn) { Add-Finding FAIL "A CRYPTO_*_GLOBAL_ENABLED flag is TRUE in the task def - crypto NOT disabled. Investigate." }
elseif ($sawFlags) { Add-Finding PASS "Crypto disabled evidence: no CRYPTO_*_GLOBAL_ENABLED=true (INR_ONLY)." }
else { Add-Finding WARN "Crypto global flags absent from task def env (default OFF in code; confirm)." }

# ---------------------------------------------------------------------------
# 2) CloudWatch log retention
# ---------------------------------------------------------------------------
Write-Host "[2] CloudWatch log retention..." -ForegroundColor Cyan
$retPath = Join-Path $OutDir '02-log-retention.txt'
"# CloudWatch log retention - captured $(Get-Date -Format o)" | Out-File $retPath -Encoding ascii
$lg = Invoke-AwsJson @('logs','describe-log-groups','--log-group-name-prefix','/ecs/cex-staging')
$retOk = $false
if ($null -ne $lg -and $null -ne $lg.logGroups) {
  foreach ($name in $logGroups) {
    $g = $lg.logGroups | Where-Object { $_.logGroupName -eq $name } | Select-Object -First 1
    if ($null -eq $g) { "$name : NOT FOUND" | Out-File $retPath -Encoding ascii -Append }
    elseif ($null -eq $g.retentionInDays) { "$name : NEVER (no retention)" | Out-File $retPath -Encoding ascii -Append }
    else { "$name : $($g.retentionInDays) days" | Out-File $retPath -Encoding ascii -Append; if ([int]$g.retentionInDays -ge 180) { $retOk = $true } }
  }
  if ($retOk) { Add-Finding PASS "Log retention evidence present (>=180 days on at least one in-scope group)." }
  else { Add-Finding WARN "No in-scope log group shows >=180-day retention (see log-retention-runbook.md)." }
} else {
  "ERROR or none." | Out-File $retPath -Encoding ascii -Append
  Add-Finding WARN "Could not read CloudWatch log groups."
}

# ---------------------------------------------------------------------------
# 3) CloudWatch alarms
# ---------------------------------------------------------------------------
Write-Host "[3] CloudWatch alarms..." -ForegroundColor Cyan
$almPath = Join-Path $OutDir '03-alarms.txt'
"# CloudWatch alarms cex-staging* - captured $(Get-Date -Format o)" | Out-File $almPath -Encoding ascii
$alm = Invoke-AwsJson @('cloudwatch','describe-alarms','--alarm-name-prefix','cex-staging')
if ($null -ne $alm -and $null -ne $alm.MetricAlarms) {
  foreach ($a in $alm.MetricAlarms) { "$($a.AlarmName): $($a.StateValue)" | Out-File $almPath -Encoding ascii -Append }
  Add-Finding PASS "$($alm.MetricAlarms.Count) cex-staging CloudWatch alarm(s) present."
} else { "none/error" | Out-File $almPath -Encoding ascii -Append; Add-Finding WARN "No cex-staging CloudWatch alarms found." }

# ---------------------------------------------------------------------------
# 4) FIU / compliance / security docs present
# ---------------------------------------------------------------------------
Write-Host "[4] Documentation presence..." -ForegroundColor Cyan
$docPath = Join-Path $OutDir '04-docs-present.txt'
"# Relevant docs present - captured $(Get-Date -Format o)" | Out-File $docPath -Encoding ascii
$docs = @(
  'docs/compliance/fiu-technical-readiness.md','docs/compliance/fiu-technical-control-matrix.md',
  'docs/compliance/kyc-aml-technical-workflow.md','docs/compliance/transaction-monitoring-readiness.md',
  'docs/compliance/fiu-reporting-readiness-runbook.md','docs/compliance/crypto-disabled-evidence.md',
  'docs/compliance/fiu-evidence-pack/README.md','docs/compliance/production-blockers.md',
  'docs/compliance/kyc-policy.md','docs/compliance/aml-cft-policy.md',
  'docs/compliance/sanctions-pep-screening-policy.md','docs/compliance/transaction-monitoring-policy.md',
  'docs/compliance/record-retention-policy.md','docs/compliance/inr-only-mode.md',
  'docs/security/secret-inventory.md','docs/security/admin-edge-security-readiness.md',
  'docs/security/log-retention-180-days.md'
)
$missing = 0
foreach ($d in $docs) {
  $full = Join-Path $repoRoot $d
  if (Test-Path $full) { "[present] $d" | Out-File $docPath -Encoding ascii -Append }
  else { "[MISSING] $d" | Out-File $docPath -Encoding ascii -Append; $missing++ }
}
if ($missing -eq 0) { Add-Finding PASS "All expected FIU/compliance/security docs present." }
else { Add-Finding WARN "$missing expected doc(s) missing (see 04-docs-present.txt)." }

# Vendor/legal gaps explicitly documented?
$readiness = Join-Path $repoRoot 'docs/compliance/fiu-technical-readiness.md'
if ((Test-Path $readiness) -and (Select-String -Path $readiness -Pattern 'Gaps and future integrations' -Quiet)) {
  Add-Finding PASS "Vendor/legal gaps are explicitly documented (fiu-technical-readiness.md)."
} else { Add-Finding WARN "Could not confirm vendor/legal gaps are documented." }

# ---------------------------------------------------------------------------
# 5) Git commit / tag evidence
# ---------------------------------------------------------------------------
Write-Host "[5] Git evidence..." -ForegroundColor Cyan
$gitPath = Join-Path $OutDir '05-git.txt'
"# Git evidence - captured $(Get-Date -Format o)" | Out-File $gitPath -Encoding ascii
Push-Location $repoRoot
"HEAD: $(git rev-parse HEAD 2>$null)" | Out-File $gitPath -Encoding ascii -Append
"branch: $(git rev-parse --abbrev-ref HEAD 2>$null)" | Out-File $gitPath -Encoding ascii -Append
"--- last 5 commits ---" | Out-File $gitPath -Encoding ascii -Append
(git log --oneline -n 5 2>$null) | Out-File $gitPath -Encoding ascii -Append
Pop-Location
Add-Finding PASS "Git commit evidence captured."

# ---------------------------------------------------------------------------
# 6) Safe reachability: API health + unauth crypto + unauth admin
# ---------------------------------------------------------------------------
Write-Host "[6] Safe reachability probes..." -ForegroundColor Cyan
$reachPath = Join-Path $OutDir '06-reachability.txt'
"# Safe reachability - captured $(Get-Date -Format o)" | Out-File $reachPath -Encoding ascii
if (-not [string]::IsNullOrWhiteSpace($ApiBase)) {
  $b = $ApiBase.TrimEnd('/')
  $h = Get-Status "$b/health"; "API health $b/health -> $h" | Out-File $reachPath -Encoding ascii -Append
  if ($h -match '^2') { Add-Finding PASS "User API health reachable ($h)." } else { Add-Finding WARN "User API health returned $h." }
  # Unauthenticated crypto endpoint must be blocked (401/403/feature-disabled), never 2xx data.
  $c = Get-Status "$b/deposits/crypto"; "Crypto (unauth) $b/deposits/crypto -> $c" | Out-File $reachPath -Encoding ascii -Append
  if ($c -eq '401' -or $c -eq '403') { Add-Finding PASS "Unauthenticated crypto endpoint blocked ($c)." }
  elseif ($c -match '^2') { Add-Finding FAIL "Unauthenticated crypto endpoint returned $c - investigate exposure." }
  else { Add-Finding WARN "Unauthenticated crypto endpoint returned $c." }
} else { "API base not provided (-ApiBase) - skipped." | Out-File $reachPath -Encoding ascii -Append }
if (-not [string]::IsNullOrWhiteSpace($AdminBase)) {
  $a = $AdminBase.TrimEnd('/')
  $ac = Get-Status "$a/users"; "Admin (unauth) $a/users -> $ac" | Out-File $reachPath -Encoding ascii -Append
  if ($ac -eq '401' -or $ac -eq '403') { Add-Finding PASS "Admin endpoint auth-protected (unauth -> $ac)." }
  elseif ($ac -match '^2') { Add-Finding FAIL "Admin endpoint returned $ac UNAUTHENTICATED - investigate." }
  else { Add-Finding WARN "Admin unauth probe returned $ac." }
} else { "Admin base not provided (-AdminBase) - skipped (auth verified in admin-endpoint-safe-checks.md)." | Out-File $reachPath -Encoding ascii -Append }

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
$summaryPath = Join-Path $OutDir '00-summary.txt'
$fail = @($findings | Where-Object { $_.Level -eq 'FAIL' }); $warn = @($findings | Where-Object { $_.Level -eq 'WARN' }); $pass = @($findings | Where-Object { $_.Level -eq 'PASS' })
$lines = @()
$lines += "EXORA Stage 7 - FIU technical evidence summary"
$lines += "captured: $(Get-Date -Format o)   region: $Region   profile: '$Profile'"
$lines += "NOTE: technical-readiness evidence only. NOT FIU compliance / legal / production-crypto readiness."
$lines += ""
$lines += "RESULT: $($fail.Count) FAIL, $($warn.Count) WARN, $($pass.Count) PASS"
$lines += "Read-only; no PII; no secrets; get-secret-value NOT called; no AWS changes."
$lines += ""
$lines += "-- FAIL --"; if ($fail.Count -eq 0) { $lines += "  (none)" } else { foreach ($f in $fail) { $lines += "  [FAIL] $($f.Message)" } }
$lines += ""; $lines += "-- WARN --"; if ($warn.Count -eq 0) { $lines += "  (none)" } else { foreach ($f in $warn) { $lines += "  [WARN] $($f.Message)" } }
$lines += ""; $lines += "-- PASS --"; foreach ($f in $pass) { $lines += "  [PASS] $($f.Message)" }
$lines | Out-File $summaryPath -Encoding ascii

Write-Host ""
Write-Host "RESULT: $($fail.Count) FAIL, $($warn.Count) WARN, $($pass.Count) PASS" -ForegroundColor $(if ($fail.Count -gt 0) { 'Red' } elseif ($warn.Count -gt 0) { 'Yellow' } else { 'Green' })
foreach ($f in $fail) { Write-Host "  [FAIL] $($f.Message)" -ForegroundColor Red }
foreach ($f in $warn) { Write-Host "  [WARN] $($f.Message)" -ForegroundColor Yellow }
Write-Host ""
Write-Host "Evidence written to: $OutDir  (git-ignored; do NOT commit)" -ForegroundColor Green
Write-Host "Technical readiness only - not a FIU/legal/compliance claim." -ForegroundColor Yellow
