<#
.SYNOPSIS
  Collect the READ-ONLY final cybersecurity/VAPT audit-freeze evidence (Stage 8).

.DESCRIPTION
  Consolidates git, ECS, task-definition, non-secret platform flags, CloudFront/S3
  frontend summary, CloudWatch retention/alarms, docs presence, safe reachability,
  and an optional local frontend fake-string scan into one git-ignored evidence
  folder with a PASS/WARN/FAIL summary.

  HARD RULES (by construction):
    * Read-only. No AWS resource is created or modified.
    * NEVER prints secrets; NEVER calls get-secret-value.
    * Does NOT export user PII. Only reads a WHITELIST of non-secret feature-flag
      env names+values; every other env var is listed by NAME only.
    * No brute force, no vulnerability scanning, no real credentials sent
      (header/status probes only, no auth).

  Compatible with Windows PowerShell 5.1 and PowerShell 7+. Pure ASCII.
  Output: evidence-pack-output/final-audit-<timestamp>/.

.PARAMETER Region          AWS region. Default ap-south-1.
.PARAMETER Profile         AWS profile. Default cex-staging (cleared with '').
.PARAMETER DistributionId  CloudFront distribution id. Default E36DO8GL4SA61N.
.PARAMETER FrontendBucket  Optional S3 frontend bucket name for an object summary.
.PARAMETER SiteBase        Frontend base URL. Default https://www.exorain.com.
.PARAMETER ApiBase         Optional user API base (https://host/api/v1) for safe checks.
.PARAMETER AdminBase       Optional admin API base (https://host/admin/v1) for a safe 401/403 check.
.PARAMETER ScanFrontend    Scan local frontend source for fake/demo strings (default $true).

.EXAMPLE
  ./collect-final-audit-evidence.ps1
  ./collect-final-audit-evidence.ps1 -ApiBase https://www.exorain.com/api/v1 -AdminBase https://www.exorain.com/admin/v1
#>
[CmdletBinding()]
param(
  [string]$Region = 'ap-south-1',
  [string]$Profile = 'cex-staging',
  [string]$DistributionId = 'E36DO8GL4SA61N',
  [string]$FrontendBucket = '',
  [string]$SiteBase = 'https://www.exorain.com',
  [string]$ApiBase = '',
  [string]$AdminBase = '',
  [bool]$ScanFrontend = $true
)

$ErrorActionPreference = 'Continue'

$awsTail = @('--region', $Region)
if (-not [string]::IsNullOrWhiteSpace($Profile)) { $awsTail += @('--profile', $Profile) }

# Repo root is two levels up from this script (scripts/security/).
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssZ')
$OutDir = Join-Path $repoRoot "evidence-pack-output/final-audit-$stamp"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Only these NON-SECRET flag names are read for their VALUES. Everything else in
# the task-def environment is read by NAME only (never value).
$nonSecretFlags = @(
  'PLATFORM_MODE','APP_ENV',
  'CRYPTO_DEPOSITS_GLOBAL_ENABLED','CRYPTO_WITHDRAWALS_GLOBAL_ENABLED',
  'CRYPTO_WALLET_GLOBAL_ENABLED','INR_DEPOSITS_GLOBAL_ENABLED',
  'INR_WITHDRAWALS_GLOBAL_ENABLED','TRADING_GLOBAL_ENABLED',
  'REQUIRE_LOGIN_LOCATION','CORS_ORIGINS'
)
$logGroups = @('/ecs/cex-staging/api','/ecs/cex-staging/admin','/ecs/cex-staging/worker','/ecs/cex-staging/scanner','/ecs/cex-staging/migrate','/ecs/cex-staging/testnet-tools')
$expectedDocs = @(
  'docs/security/stage-8-final-audit-readiness.md','docs/security/vapt-scope.md',
  'docs/security/vapt-evidence-checklist.md','docs/security/final-security-control-matrix.md',
  'docs/security/final-smoke-test-runbook.md','docs/security/final-evidence-pack/README.md',
  'docs/compliance/production-blockers.md','docs/compliance/crypto-disabled-evidence.md',
  'docs/compliance/fiu-evidence-pack/README.md','docs/security/README.md'
)
# Fake/demo strings that must NOT appear in built/user-facing frontend source.
$fakeStrings = @(
  'Rahul Verma','Welcome back, trader','Refer and Earn','Active Devices 3',
  'demo balance','fake PnL','fake win rate','dummy alert','placeholder session','fake alert'
)

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

Write-Host "EXORA Stage 8 - final audit evidence (READ-ONLY, no PII/secrets) -> $OutDir" -ForegroundColor Green
Write-Host "Region: $Region  Profile: '$Profile'  Distribution: $DistributionId" -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# 1) Git commit / branch / tags
# ---------------------------------------------------------------------------
Write-Host "[1] Git evidence..." -ForegroundColor Cyan
$gitPath = Join-Path $OutDir '01-git.txt'
"# Git evidence - captured $(Get-Date -Format o)" | Out-File $gitPath -Encoding ascii
Push-Location $repoRoot
"HEAD:   $(git rev-parse HEAD 2>$null)"                 | Out-File $gitPath -Encoding ascii -Append
"branch: $(git rev-parse --abbrev-ref HEAD 2>$null)"    | Out-File $gitPath -Encoding ascii -Append
"--- tags ---"                                          | Out-File $gitPath -Encoding ascii -Append
(git tag --list 2>$null)                                | Out-File $gitPath -Encoding ascii -Append
"--- last 8 commits ---"                                | Out-File $gitPath -Encoding ascii -Append
(git log --oneline -n 8 2>$null)                        | Out-File $gitPath -Encoding ascii -Append
Pop-Location
Add-Finding PASS "Git commit/branch/tag evidence captured."

# ---------------------------------------------------------------------------
# 2) ECS service state
# ---------------------------------------------------------------------------
Write-Host "[2] ECS services..." -ForegroundColor Cyan
$ecsPath = Join-Path $OutDir '02-ecs.txt'
"# ECS services cex-staging - captured $(Get-Date -Format o)" | Out-File $ecsPath -Encoding ascii
$svcJson = Invoke-AwsJson @('ecs','describe-services','--cluster','cex-staging','--services','cex-staging-api','cex-staging-admin')
$ecsStable = $false
if ($null -ne $svcJson -and $null -ne $svcJson.services -and $svcJson.services.Count -gt 0) {
  $stableCount = 0
  foreach ($s in $svcJson.services) {
    "$($s.serviceName): status=$($s.status) running=$($s.runningCount) desired=$($s.desiredCount) taskDef=$($s.taskDefinition)" | Out-File $ecsPath -Encoding ascii -Append
    if ($s.runningCount -ge $s.desiredCount -and $s.desiredCount -gt 0) { $stableCount++ }
  }
  $ecsStable = ($stableCount -eq $svcJson.services.Count)
  if ($ecsStable) { Add-Finding PASS "ECS services stable (running >= desired for all)." }
  else { Add-Finding WARN "One or more ECS services not at desired count." }
} else {
  "ERROR: describe-services failed (credentials/permissions?)." | Out-File $ecsPath -Encoding ascii -Append
  Add-Finding WARN "Could not describe ECS services."
}

# ---------------------------------------------------------------------------
# 3) Task definitions (api + admin): image tags/digests (non-secret)
# ---------------------------------------------------------------------------
Write-Host "[3] Task definitions / image tags..." -ForegroundColor Cyan
$tdPath = Join-Path $OutDir '03-taskdef.txt'
"# Task definitions - captured $(Get-Date -Format o)" | Out-File $tdPath -Encoding ascii
foreach ($tdName in @('cex-staging-api','cex-staging-admin')) {
  "===== $tdName =====" | Out-File $tdPath -Encoding ascii -Append
  $td = Invoke-AwsJson @('ecs','describe-task-definition','--task-definition',$tdName)
  if ($null -ne $td -and $null -ne $td.taskDefinition) {
    "revision: $($td.taskDefinition.revision)" | Out-File $tdPath -Encoding ascii -Append
    foreach ($c in @($td.taskDefinition.containerDefinitions)) {
      "  container $($c.name): image=$($c.image)" | Out-File $tdPath -Encoding ascii -Append
    }
    Add-Finding PASS "Read $tdName task definition + image reference."
  } else {
    "ERROR: could not read $tdName." | Out-File $tdPath -Encoding ascii -Append
    Add-Finding WARN "Could not read task definition $tdName."
  }
}

# ---------------------------------------------------------------------------
# 4) Non-secret platform feature flags (values) + crypto-off assertion
# ---------------------------------------------------------------------------
Write-Host "[4] Platform flags (non-secret)..." -ForegroundColor Cyan
$flagPath = Join-Path $OutDir '04-platform-flags.txt'
"# Platform flags (non-secret whitelist) - captured $(Get-Date -Format o)" | Out-File $flagPath -Encoding ascii
$td = Invoke-AwsJson @('ecs','describe-task-definition','--task-definition','cex-staging-api')
$cryptoOn = $false; $sawFlags = $false; $inrOnly = $false; $locOn = $false
if ($null -ne $td -and $null -ne $td.taskDefinition) {
  $envArr = @(); if ($td.taskDefinition.containerDefinitions[0].environment) { $envArr = @($td.taskDefinition.containerDefinitions[0].environment) }
  "--- non-secret feature flags (whitelisted names + values) ---" | Out-File $flagPath -Encoding ascii -Append
  foreach ($name in $nonSecretFlags) {
    $entry = $envArr | Where-Object { $_.name -eq $name } | Select-Object -First 1
    if ($null -ne $entry) {
      $sawFlags = $true
      $val = [string]$entry.value
      "$($entry.name) = $val" | Out-File $flagPath -Encoding ascii -Append
      if ($name -like 'CRYPTO_*_GLOBAL_ENABLED' -and $val.ToLower() -eq 'true') { $cryptoOn = $true }
      if ($name -eq 'PLATFORM_MODE' -and $val.ToUpper() -eq 'INR_ONLY') { $inrOnly = $true }
      if ($name -eq 'REQUIRE_LOGIN_LOCATION' -and $val.ToLower() -eq 'true') { $locOn = $true }
    } else {
      "$name = (absent -> code default)" | Out-File $flagPath -Encoding ascii -Append
    }
  }
  "--- all env var NAMES (values NOT shown) ---" | Out-File $flagPath -Encoding ascii -Append
  ($envArr | ForEach-Object { $_.name }) -join ', ' | Out-File $flagPath -Encoding ascii -Append
  Add-Finding PASS "Read platform feature flags (whitelisted values only; other names only)."
} else {
  "ERROR: could not read cex-staging-api task definition." | Out-File $flagPath -Encoding ascii -Append
  Add-Finding WARN "Could not read cex-staging-api task definition for flags."
}
if ($cryptoOn) { Add-Finding FAIL "A CRYPTO_*_GLOBAL_ENABLED flag is TRUE - crypto NOT disabled. Investigate." }
elseif ($sawFlags) { Add-Finding PASS "Crypto globally disabled: no CRYPTO_*_GLOBAL_ENABLED=true." }
else { Add-Finding WARN "Crypto global flags absent from task def env (default OFF in code; confirm)." }
if ($inrOnly) { Add-Finding PASS "Platform mode INR_ONLY confirmed in task def." }
else { Add-Finding WARN "PLATFORM_MODE not observed as INR_ONLY in task def (confirm via /auth/me)." }
if ($locOn) { Add-Finding PASS "Login location requirement enabled (REQUIRE_LOGIN_LOCATION=true)." }
else { Add-Finding WARN "REQUIRE_LOGIN_LOCATION not observed as true in task def (confirm)." }

# ---------------------------------------------------------------------------
# 5) CloudFront distribution + optional S3 frontend object summary
# ---------------------------------------------------------------------------
Write-Host "[5] CloudFront / S3 frontend summary..." -ForegroundColor Cyan
$cfPath = Join-Path $OutDir '05-cloudfront-s3.txt'
"# CloudFront + S3 frontend - captured $(Get-Date -Format o)" | Out-File $cfPath -Encoding ascii
$cf = Invoke-AwsJson @('cloudfront','get-distribution','--id',$DistributionId)
if ($null -ne $cf -and $null -ne $cf.Distribution) {
  $d = $cf.Distribution; $cfg = $d.DistributionConfig
  $aliases = @(); if ($cfg.Aliases -and $cfg.Aliases.Items) { $aliases = @($cfg.Aliases.Items) }
  $vc = $cfg.ViewerCertificate
  $certSummary = if ($vc.ACMCertificateArn) { "ACM: $($vc.ACMCertificateArn)" } elseif ($vc.CloudFrontDefaultCertificate) { "CloudFront default cert" } else { "custom/iam cert" }
  "Status:     $($d.Status)"                     | Out-File $cfPath -Encoding ascii -Append
  "DomainName: $($d.DomainName)"                 | Out-File $cfPath -Encoding ascii -Append
  "Aliases:    $([string]::Join(', ', $aliases))" | Out-File $cfPath -Encoding ascii -Append
  "ViewerCert: $certSummary"                     | Out-File $cfPath -Encoding ascii -Append
  "WebACLId:   $(if ([string]::IsNullOrWhiteSpace([string]$cfg.WebACLId)) { '(none)' } else { $cfg.WebACLId })" | Out-File $cfPath -Encoding ascii -Append
  if ($d.Status -eq 'Deployed') { Add-Finding PASS "CloudFront $DistributionId is Deployed." } else { Add-Finding WARN "CloudFront $DistributionId status '$($d.Status)'." }
} else {
  "ERROR: could not read CloudFront distribution $DistributionId." | Out-File $cfPath -Encoding ascii -Append
  Add-Finding WARN "Could not read CloudFront distribution $DistributionId."
}
if (-not [string]::IsNullOrWhiteSpace($FrontendBucket)) {
  "--- S3 frontend bucket object summary: $FrontendBucket ---" | Out-File $cfPath -Encoding ascii -Append
  $ls = Invoke-AwsJson @('s3api','list-objects-v2','--bucket',$FrontendBucket,'--max-items','1')
  $summary = & aws s3 ls "s3://$FrontendBucket" --recursive --summarize @awsTail 2>$null | Select-Object -Last 2
  if ($summary) { $summary | Out-File $cfPath -Encoding ascii -Append; Add-Finding PASS "S3 frontend bucket object summary captured." }
  else { "ERROR or empty for bucket $FrontendBucket." | Out-File $cfPath -Encoding ascii -Append; Add-Finding WARN "Could not summarize S3 bucket $FrontendBucket." }
} else {
  "S3 frontend bucket not provided (-FrontendBucket) - skipped." | Out-File $cfPath -Encoding ascii -Append
}

# ---------------------------------------------------------------------------
# 6) CloudWatch log retention (>=180 days)
# ---------------------------------------------------------------------------
Write-Host "[6] CloudWatch log retention..." -ForegroundColor Cyan
$retPath = Join-Path $OutDir '06-log-retention.txt'
"# CloudWatch log retention - captured $(Get-Date -Format o)" | Out-File $retPath -Encoding ascii
$lg = Invoke-AwsJson @('logs','describe-log-groups','--log-group-name-prefix','/ecs/cex-staging')
$retOk = $false
if ($null -ne $lg -and $null -ne $lg.logGroups) {
  foreach ($name in $logGroups) {
    $g = $lg.logGroups | Where-Object { $_.logGroupName -eq $name } | Select-Object -First 1
    if ($null -eq $g) { "$name : NOT FOUND" | Out-File $retPath -Encoding ascii -Append }
    elseif ($null -eq $g.retentionInDays) { "$name : NEVER (no retention set)" | Out-File $retPath -Encoding ascii -Append }
    else { "$name : $($g.retentionInDays) days" | Out-File $retPath -Encoding ascii -Append; if ([int]$g.retentionInDays -ge 180) { $retOk = $true } }
  }
  if ($retOk) { Add-Finding PASS "Log retention >=180 days on at least one in-scope group." }
  else { Add-Finding WARN "No in-scope log group shows >=180-day retention (see log-retention-runbook.md)." }
} else {
  "ERROR or none." | Out-File $retPath -Encoding ascii -Append
  Add-Finding WARN "Could not read CloudWatch log groups."
}

# ---------------------------------------------------------------------------
# 7) CloudWatch alarms
# ---------------------------------------------------------------------------
Write-Host "[7] CloudWatch alarms..." -ForegroundColor Cyan
$almPath = Join-Path $OutDir '07-alarms.txt'
"# CloudWatch alarms cex-staging* - captured $(Get-Date -Format o)" | Out-File $almPath -Encoding ascii
$alm = Invoke-AwsJson @('cloudwatch','describe-alarms','--alarm-name-prefix','cex-staging')
if ($null -ne $alm -and $null -ne $alm.MetricAlarms -and $alm.MetricAlarms.Count -gt 0) {
  foreach ($a in $alm.MetricAlarms) { "$($a.AlarmName): $($a.StateValue) [$($a.MetricName)]" | Out-File $almPath -Encoding ascii -Append }
  Add-Finding PASS "$($alm.MetricAlarms.Count) cex-staging CloudWatch alarm(s) present."
} else { "none/error" | Out-File $almPath -Encoding ascii -Append; Add-Finding WARN "No cex-staging CloudWatch alarms found." }

# ---------------------------------------------------------------------------
# 8) Documentation presence
# ---------------------------------------------------------------------------
Write-Host "[8] Documentation presence..." -ForegroundColor Cyan
$docPath = Join-Path $OutDir '08-docs-present.txt'
"# Stage 8 docs present - captured $(Get-Date -Format o)" | Out-File $docPath -Encoding ascii
$missing = 0
foreach ($d in $expectedDocs) {
  $full = Join-Path $repoRoot $d
  if (Test-Path $full) { "[present] $d" | Out-File $docPath -Encoding ascii -Append }
  else { "[MISSING] $d" | Out-File $docPath -Encoding ascii -Append; $missing++ }
}
if ($missing -eq 0) { Add-Finding PASS "All expected Stage 8 docs present." }
else { Add-Finding WARN "$missing expected doc(s) missing (see 08-docs-present.txt)." }

# ---------------------------------------------------------------------------
# 9) Safe reachability (no auth, no brute force)
# ---------------------------------------------------------------------------
Write-Host "[9] Safe reachability probes..." -ForegroundColor Cyan
$reachPath = Join-Path $OutDir '09-reachability.txt'
"# Safe reachability - captured $(Get-Date -Format o)" | Out-File $reachPath -Encoding ascii
# Frontend root + login + admin login pages
$rootCode = Get-Status $SiteBase; "root $SiteBase -> $rootCode" | Out-File $reachPath -Encoding ascii -Append
if ($rootCode -match '^(2|3)') { Add-Finding PASS "Frontend root reachable ($rootCode)." } else { Add-Finding WARN "Frontend root returned $rootCode." }
$loginCode = Get-Status ($SiteBase.TrimEnd('/') + '/login'); "login page -> $loginCode" | Out-File $reachPath -Encoding ascii -Append
if ($loginCode -match '^(2|3)') { Add-Finding PASS "Login page reachable ($loginCode)." } else { Add-Finding WARN "Login page returned $loginCode." }
$adminLoginCode = Get-Status ($SiteBase.TrimEnd('/') + '/admin/login'); "admin login page -> $adminLoginCode" | Out-File $reachPath -Encoding ascii -Append
if ($adminLoginCode -match '^(2|3|401|403)') { Add-Finding PASS "Admin login page reachable/protected ($adminLoginCode)." } else { Add-Finding WARN "Admin login page returned $adminLoginCode." }

if (-not [string]::IsNullOrWhiteSpace($ApiBase)) {
  $b = $ApiBase.TrimEnd('/')
  # Unauthenticated login WITHOUT location must NOT succeed; expect LOCATION_REQUIRED or a safe 4xx.
  $loginPost = & curl.exe -sS -o /dev/null -w "%{http_code}" --max-time 20 -X POST "$b/auth/login" -H "Content-Type: application/json" -d '{}' 2>$null
  "unauth POST $b/auth/login (no location, empty body) -> $loginPost" | Out-File $reachPath -Encoding ascii -Append
  if ($loginPost -match '^(4)') { Add-Finding PASS "Unauth login without location returns safe 4xx ($loginPost; expect LOCATION_REQUIRED/validation)." }
  elseif ($loginPost -match '^2') { Add-Finding FAIL "Unauth login returned $loginPost - investigate (should not succeed without creds/location)." }
  else { Add-Finding WARN "Unauth login probe returned $loginPost." }
  # Crypto endpoint (unauth) must be blocked.
  $cryptoCode = Get-Status "$b/deposits/crypto"; "unauth $b/deposits/crypto -> $cryptoCode" | Out-File $reachPath -Encoding ascii -Append
  if ($cryptoCode -eq '401' -or $cryptoCode -eq '403') { Add-Finding PASS "Unauthenticated crypto endpoint blocked ($cryptoCode)." }
  elseif ($cryptoCode -match '^2') { Add-Finding FAIL "Unauthenticated crypto endpoint returned $cryptoCode - investigate exposure." }
  else { Add-Finding WARN "Unauthenticated crypto endpoint returned $cryptoCode." }
} else { "API base not provided (-ApiBase) - login/crypto checks skipped." | Out-File $reachPath -Encoding ascii -Append }

if (-not [string]::IsNullOrWhiteSpace($AdminBase)) {
  $a = $AdminBase.TrimEnd('/')
  $ac = Get-Status "$a/users"; "unauth $a/users -> $ac" | Out-File $reachPath -Encoding ascii -Append
  if ($ac -eq '401' -or $ac -eq '403') { Add-Finding PASS "Admin endpoint auth-protected (unauth -> $ac)." }
  elseif ($ac -match '^2') { Add-Finding FAIL "Admin endpoint returned $ac UNAUTHENTICATED - investigate." }
  else { Add-Finding WARN "Admin endpoint unauth probe returned $ac." }
} else { "Admin base not provided (-AdminBase) - admin check skipped." | Out-File $reachPath -Encoding ascii -Append }

# ---------------------------------------------------------------------------
# 10) Local frontend fake/demo string scan
# ---------------------------------------------------------------------------
Write-Host "[10] Frontend fake/demo string scan..." -ForegroundColor Cyan
$scanPath = Join-Path $OutDir '10-frontend-scan.txt'
"# Frontend fake/demo string scan - captured $(Get-Date -Format o)" | Out-File $scanPath -Encoding ascii
if ($ScanFrontend) {
  $frontendDir = Join-Path $repoRoot 'frontend'
  if (Test-Path $frontendDir) {
    $hits = 0; $benign = 0
    $srcFiles = Get-ChildItem -Path $frontendDir -Recurse -Include *.ts,*.tsx,*.js,*.jsx -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\.next\\' }
    foreach ($f in $srcFiles) {
      $lineNo = 0
      foreach ($line in (Get-Content -LiteralPath $f.FullName -ErrorAction SilentlyContinue)) {
        $lineNo++
        foreach ($needle in $fakeStrings) {
          if ($line -like "*$needle*") {
            $rel = $f.FullName.Substring($repoRoot.Path.Length).TrimStart('\','/')
            # A source comment that DISCLAIMS fake data (e.g. "no fake alert/...")
            # is the codebase documenting ABSENCE, not user-facing fake data.
            if ($line -match '(?i)\bno\s+fake\b') {
              "[benign disclaimer] '$needle' in ${rel}:${lineNo} -> $($line.Trim())" | Out-File $scanPath -Encoding ascii -Append
              $benign++
            } else {
              "[HIT] '$needle' in ${rel}:${lineNo} -> $($line.Trim())" | Out-File $scanPath -Encoding ascii -Append
              $hits++
            }
          }
        }
      }
    }
    "summary: $hits real hit(s), $benign benign disclaimer(s) skipped." | Out-File $scanPath -Encoding ascii -Append
    if ($hits -eq 0) { Add-Finding PASS "No fake/demo strings in frontend source ($benign benign disclaimer(s) skipped)." }
    else { Add-Finding WARN "$hits fake/demo string hit(s) in frontend source (see 10-frontend-scan.txt)." }
  } else { "frontend/ not found - skipped." | Out-File $scanPath -Encoding ascii -Append; Add-Finding WARN "frontend/ directory not found for scan." }
} else { "Frontend scan disabled (-ScanFrontend $false)." | Out-File $scanPath -Encoding ascii -Append }

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
$summaryPath = Join-Path $OutDir '00-summary.txt'
$fail = @($findings | Where-Object { $_.Level -eq 'FAIL' })
$warn = @($findings | Where-Object { $_.Level -eq 'WARN' })
$pass = @($findings | Where-Object { $_.Level -eq 'PASS' })
$lines = @()
$lines += "EXORA Stage 8 - final audit-freeze evidence summary"
$lines += "captured: $(Get-Date -Format o)"
$lines += "region: $Region  profile: '$Profile'  distribution: $DistributionId"
$lines += "mode target: INR_ONLY  crypto: globally disabled (must stay OFF)"
$lines += ""
$lines += "RESULT: $($fail.Count) FAIL, $($warn.Count) WARN, $($pass.Count) PASS"
$lines += "Read-only; no secrets; no get-secret-value; no PII; no scanning/brute-force; no AWS changes."
$lines += ""
$lines += "-- FAIL --"; if ($fail.Count -eq 0) { $lines += "  (none)" } else { foreach ($f in $fail) { $lines += "  [FAIL] $($f.Message)" } }
$lines += ""
$lines += "-- WARN (audit-readiness gaps) --"; if ($warn.Count -eq 0) { $lines += "  (none)" } else { foreach ($f in $warn) { $lines += "  [WARN] $($f.Message)" } }
$lines += ""
$lines += "-- PASS --"; foreach ($f in $pass) { $lines += "  [PASS] $($f.Message)" }
$lines | Out-File $summaryPath -Encoding ascii

Write-Host ""
Write-Host "RESULT: $($fail.Count) FAIL, $($warn.Count) WARN, $($pass.Count) PASS" -ForegroundColor $(if ($fail.Count -gt 0) { 'Red' } elseif ($warn.Count -gt 0) { 'Yellow' } else { 'Green' })
foreach ($f in $fail) { Write-Host "  [FAIL] $($f.Message)" -ForegroundColor Red }
foreach ($f in $warn) { Write-Host "  [WARN] $($f.Message)" -ForegroundColor Yellow }
Write-Host ""
Write-Host "Evidence written to: $OutDir  (git-ignored; do NOT commit)" -ForegroundColor Green
