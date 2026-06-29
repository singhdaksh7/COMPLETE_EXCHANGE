<#
.SYNOPSIS
  Collect READ-ONLY public attack-surface / edge-security evidence (Stage 6).

.DESCRIPTION
  Gathers CloudFront, DNS, response-header, ECS, CloudWatch-alarm, and WAF
  posture into a git-ignored evidence folder, and prints a PASS/WARN/FAIL
  summary. Strictly read-only and non-aggressive:
    * No secrets printed; no get-secret-value.
    * No brute force, no vulnerability scanning, no exploitation.
    * No real credentials sent (header/reachability probes only).
    * No AWS resource is created or modified.

  Compatible with Windows PowerShell 5.1 and PowerShell 7+. Pure ASCII.
  Output: evidence-pack-output/edge-security-<timestamp>/.

.PARAMETER Region          AWS region. Default ap-south-1.
.PARAMETER Profile         AWS profile. Default cex-staging (cleared with '').
.PARAMETER DistributionId  CloudFront distribution id. Default E36DO8GL4SA61N.
.PARAMETER CloudFrontDomain  CloudFront domain. Default dfk68tws8g8oj.cloudfront.net.
.PARAMETER CustomDomain    Custom frontend domain. Default www.exorain.com.
.PARAMETER AdminBase       Optional admin API base (e.g. https://host/admin/v1) for a SAFE 401/403 check.
.PARAMETER ApiBase         Optional user API base (e.g. https://host/api/v1) for a SAFE health check.

.EXAMPLE
  ./collect-edge-security-evidence.ps1
  ./collect-edge-security-evidence.ps1 -AdminBase https://admin-host/admin/v1
#>
[CmdletBinding()]
param(
  [string]$Region = 'ap-south-1',
  [string]$Profile = 'cex-staging',
  [string]$DistributionId = 'E36DO8GL4SA61N',
  [string]$CloudFrontDomain = 'dfk68tws8g8oj.cloudfront.net',
  [string]$CustomDomain = 'www.exorain.com',
  [string]$AdminBase = '',
  [string]$ApiBase = ''
)

$ErrorActionPreference = 'Continue'

$awsTail = @('--region', $Region)
if (-not [string]::IsNullOrWhiteSpace($Profile)) { $awsTail += @('--profile', $Profile) }

$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssZ')
$OutDir = Join-Path '.' "evidence-pack-output/edge-security-$stamp"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$findings = New-Object System.Collections.ArrayList
function Add-Finding {
  param([ValidateSet('PASS','WARN','FAIL')][string]$Level, [string]$Message)
  [void]$findings.Add([pscustomobject]@{ Level = $Level; Message = $Message })
}
function Invoke-AwsJson {
  param([string[]]$ArgList)
  $raw = & aws @ArgList @awsTail --output json 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  $text = ($raw -join "`n")
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  try { return ($text | ConvertFrom-Json) } catch { return $null }
}
# Use curl.exe explicitly (in Windows PowerShell, `curl` is an alias for
# Invoke-WebRequest). Returns header lines as an array.
function Get-Headers {
  param([string]$Url)
  $out = & curl.exe -sS -I -L --max-time 25 $Url 2>$null
  if ($LASTEXITCODE -ne 0 -or $null -eq $out) { return @() }
  return @($out)
}
function Has-Header {
  param([string[]]$Headers, [string]$Name)
  return @($Headers | Where-Object { $_ -match ("^(?i)" + [regex]::Escape($Name) + "\s*:") }).Count -gt 0
}

Write-Host "EXORA Stage 6 - edge security evidence (READ-ONLY) -> $OutDir" -ForegroundColor Green
Write-Host "Region: $Region  Profile: '$Profile'  Distribution: $DistributionId" -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# 1) CloudFront distribution: status, aliases, cert, origins, behaviors, WAF
# ---------------------------------------------------------------------------
Write-Host "[1] CloudFront distribution..." -ForegroundColor Cyan
$cfPath = Join-Path $OutDir '01-cloudfront.txt'
"# CloudFront distribution $DistributionId - captured $(Get-Date -Format o)" | Out-File $cfPath -Encoding ascii

$cf = Invoke-AwsJson @('cloudfront','get-distribution','--id',$DistributionId)
$webAclId = ''
if ($null -eq $cf -or $null -eq $cf.Distribution) {
  "ERROR: get-distribution failed (credentials/permissions/id?)." | Out-File $cfPath -Encoding ascii -Append
  Add-Finding WARN "Could not read CloudFront distribution $DistributionId."
} else {
  $d = $cf.Distribution
  $status = $d.Status
  $domain = $d.DomainName
  $cfg = $d.DistributionConfig
  $aliases = @(); if ($cfg.Aliases -and $cfg.Aliases.Items) { $aliases = @($cfg.Aliases.Items) }
  $origins = @(); if ($cfg.Origins -and $cfg.Origins.Items) { $origins = @($cfg.Origins.Items | ForEach-Object { $_.DomainName }) }
  $webAclId = [string]$cfg.WebACLId
  $certSummary = if ($cfg.ViewerCertificate) {
    $vc = $cfg.ViewerCertificate
    if ($vc.ACMCertificateArn) { "ACM: $($vc.ACMCertificateArn)" }
    elseif ($vc.CloudFrontDefaultCertificate) { "CloudFront default cert" }
    else { "custom/iam cert" }
  } else { "n/a" }

  "Status:          $status"          | Out-File $cfPath -Encoding ascii -Append
  "DomainName:      $domain"          | Out-File $cfPath -Encoding ascii -Append
  "Aliases:         $([string]::Join(', ', $aliases))" | Out-File $cfPath -Encoding ascii -Append
  "ViewerCert:      $certSummary"     | Out-File $cfPath -Encoding ascii -Append
  "Origins:         $([string]::Join(', ', $origins))" | Out-File $cfPath -Encoding ascii -Append
  "WebACLId:        $(if ([string]::IsNullOrWhiteSpace($webAclId)) { '(none)' } else { $webAclId })" | Out-File $cfPath -Encoding ascii -Append
  $behaviorCount = 0; if ($cfg.CacheBehaviors -and $cfg.CacheBehaviors.Quantity) { $behaviorCount = $cfg.CacheBehaviors.Quantity }
  "CacheBehaviors:  $behaviorCount additional (+default)" | Out-File $cfPath -Encoding ascii -Append

  if ($status -eq 'Deployed') { Add-Finding PASS "CloudFront $DistributionId is Deployed." }
  else { Add-Finding WARN "CloudFront $DistributionId status is '$status' (not Deployed)." }

  if ($aliases.Count -gt 0) { Add-Finding PASS "CloudFront has custom domain alias(es): $([string]::Join(', ', $aliases))." }
  else { Add-Finding WARN "CloudFront distribution has NO custom-domain aliases (the live www may be served elsewhere, e.g. Vercel)." }

  if ([string]::IsNullOrWhiteSpace($webAclId)) { Add-Finding WARN "No WAF WebACL associated with CloudFront $DistributionId (edge WAF not enforced)." }
  else { Add-Finding PASS "WAF WebACL associated with CloudFront: $webAclId." }
}

# ---------------------------------------------------------------------------
# 2) DNS for the custom domain + root redirect check
# ---------------------------------------------------------------------------
Write-Host "[2] DNS + root redirect..." -ForegroundColor Cyan
$dnsPath = Join-Path $OutDir '02-dns.txt'
"# DNS - captured $(Get-Date -Format o)" | Out-File $dnsPath -Encoding ascii
try {
  $cname = Resolve-DnsName -Name $CustomDomain -Type CNAME -ErrorAction Stop | Select-Object -First 1
  "$CustomDomain CNAME -> $($cname.NameHost)" | Out-File $dnsPath -Encoding ascii -Append
  Add-Finding PASS "$CustomDomain resolves (CNAME -> $($cname.NameHost))."
} catch {
  "$CustomDomain CNAME lookup failed: $($_.Exception.Message)" | Out-File $dnsPath -Encoding ascii -Append
  Add-Finding WARN "$CustomDomain CNAME lookup failed."
}
# Root redirect (e.g. exorain.com -> www). Best-effort host derivation.
$rootDomain = ($CustomDomain -replace '^www\.', '')
$rootHeaders = Get-Headers ("https://" + $rootDomain)
$rootHeaders | Out-File $dnsPath -Encoding ascii -Append
$statusLine = @($rootHeaders | Where-Object { $_ -match '^HTTP/' } | Select-Object -First 1)
$locLine = @($rootHeaders | Where-Object { $_ -match '^(?i)location\s*:' } | Select-Object -First 1)
if (($statusLine -match '30[12]') -and ($locLine -match 'www\.')) { Add-Finding PASS "Root $rootDomain redirects to www." }
else { Add-Finding WARN "Root $rootDomain redirect to www not clearly detected." }

# ---------------------------------------------------------------------------
# 3) Response headers (custom domain + CloudFront direct)
# ---------------------------------------------------------------------------
Write-Host "[3] Response headers..." -ForegroundColor Cyan
$hdrPath = Join-Path $OutDir '03-response-headers.txt'
"# Response headers - captured $(Get-Date -Format o)" | Out-File $hdrPath -Encoding ascii
$securityHeaders = @('Strict-Transport-Security','X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy','Content-Security-Policy')
foreach ($target in @(("https://" + $CustomDomain), ("https://" + $CloudFrontDomain))) {
  "===== $target =====" | Out-File $hdrPath -Encoding ascii -Append
  $h = Get-Headers $target
  $h | Out-File $hdrPath -Encoding ascii -Append
  if ($h.Count -eq 0) { Add-Finding WARN "$target did not respond to a header probe."; continue }
  $sl = @($h | Where-Object { $_ -match '^HTTP/' } | Select-Object -First 1)
  if ($sl -match '\b(2\d\d|3\d\d)\b') { Add-Finding PASS "$target reachable over HTTPS ($($sl.Trim()))." }
  $present = @(); $missing = @()
  foreach ($sh in $securityHeaders) { if (Has-Header $h $sh) { $present += $sh } else { $missing += $sh } }
  "  present: $([string]::Join(', ', $present))" | Out-File $hdrPath -Encoding ascii -Append
  "  MISSING: $([string]::Join(', ', $missing))" | Out-File $hdrPath -Encoding ascii -Append
  if ($missing.Count -eq 0) { Add-Finding PASS "$target has all baseline security headers." }
  else { Add-Finding WARN "$target missing security header(s): $([string]::Join(', ', $missing))." }
}

# ---------------------------------------------------------------------------
# 4) Safe API / admin reachability (no credentials, no brute force)
# ---------------------------------------------------------------------------
Write-Host "[4] Safe reachability probes..." -ForegroundColor Cyan
$reachPath = Join-Path $OutDir '04-reachability.txt'
"# Reachability (safe) - captured $(Get-Date -Format o)" | Out-File $reachPath -Encoding ascii
function Get-Status { param([string]$Url) $code = & curl.exe -sS -o /dev/null -w "%{http_code}" --max-time 20 $Url 2>$null; return $code }

if (-not [string]::IsNullOrWhiteSpace($ApiBase)) {
  $code = Get-Status ($ApiBase.TrimEnd('/') + '/health')
  "API health $ApiBase/health -> $code" | Out-File $reachPath -Encoding ascii -Append
  if ($code -match '^2') { Add-Finding PASS "User API health reachable ($code)." } else { Add-Finding WARN "User API health returned $code." }
} else {
  "API base not provided (-ApiBase) - skipped." | Out-File $reachPath -Encoding ascii -Append
}

if (-not [string]::IsNullOrWhiteSpace($AdminBase)) {
  # UNAUTHENTICATED request to a privileged admin path: MUST be 401/403, not data.
  $code = Get-Status ($AdminBase.TrimEnd('/') + '/users')
  "Admin (unauth) $AdminBase/users -> $code" | Out-File $reachPath -Encoding ascii -Append
  if ($code -eq '401' -or $code -eq '403') { Add-Finding PASS "Admin endpoint reachable but AUTH-PROTECTED (unauth -> $code)." }
  elseif ($code -match '^2') { Add-Finding FAIL "Admin endpoint returned $code UNAUTHENTICATED - possible data exposure! Investigate immediately." }
  else { Add-Finding WARN "Admin endpoint unauth probe returned $code." }
} else {
  "Admin base not provided (-AdminBase) - skipped (admin auth verified in code/admin-endpoint-safe-checks.md)." | Out-File $reachPath -Encoding ascii -Append
}

# ---------------------------------------------------------------------------
# 5) ECS service / task definition references
# ---------------------------------------------------------------------------
Write-Host "[5] ECS service references..." -ForegroundColor Cyan
$ecsPath = Join-Path $OutDir '05-ecs.txt'
"# ECS services - captured $(Get-Date -Format o)" | Out-File $ecsPath -Encoding ascii
$svcJson = Invoke-AwsJson @('ecs','describe-services','--cluster','cex-staging','--services','cex-staging-api','cex-staging-admin')
if ($null -eq $svcJson -or $null -eq $svcJson.services) {
  "ERROR: describe-services failed." | Out-File $ecsPath -Encoding ascii -Append
  Add-Finding WARN "Could not describe ECS services."
} else {
  foreach ($s in $svcJson.services) {
    "$($s.serviceName): running=$($s.runningCount) desired=$($s.desiredCount) taskDef=$($s.taskDefinition)" | Out-File $ecsPath -Encoding ascii -Append
  }
  Add-Finding PASS "Read ECS service references for $($svcJson.services.Count) service(s)."
}

# ---------------------------------------------------------------------------
# 6) CloudWatch alarms (cex-staging prefix)
# ---------------------------------------------------------------------------
Write-Host "[6] CloudWatch alarms..." -ForegroundColor Cyan
$almPath = Join-Path $OutDir '06-cloudwatch-alarms.txt'
"# CloudWatch alarms cex-staging* - captured $(Get-Date -Format o)" | Out-File $almPath -Encoding ascii
$alm = Invoke-AwsJson @('cloudwatch','describe-alarms','--alarm-name-prefix','cex-staging')
if ($null -eq $alm -or $null -eq $alm.MetricAlarms) {
  "ERROR or none." | Out-File $almPath -Encoding ascii -Append
  Add-Finding WARN "Could not read CloudWatch alarms (or none with cex-staging prefix)."
} else {
  foreach ($a in $alm.MetricAlarms) { "$($a.AlarmName): $($a.StateValue) [$($a.MetricName)]" | Out-File $almPath -Encoding ascii -Append }
  if ($alm.MetricAlarms.Count -gt 0) { Add-Finding PASS "$($alm.MetricAlarms.Count) cex-staging CloudWatch alarm(s) present." }
  else { Add-Finding WARN "No cex-staging CloudWatch alarms found." }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
$summaryPath = Join-Path $OutDir '00-summary.txt'
$fail = @($findings | Where-Object { $_.Level -eq 'FAIL' })
$warn = @($findings | Where-Object { $_.Level -eq 'WARN' })
$pass = @($findings | Where-Object { $_.Level -eq 'PASS' })
$lines = @()
$lines += "EXORA Stage 6 - edge security evidence summary"
$lines += "captured: $(Get-Date -Format o)"
$lines += "region: $Region  profile: '$Profile'  distribution: $DistributionId"
$lines += ""
$lines += "RESULT: $($fail.Count) FAIL, $($warn.Count) WARN, $($pass.Count) PASS"
$lines += "Read-only; no secrets; no scanning/brute-force; no AWS changes."
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
