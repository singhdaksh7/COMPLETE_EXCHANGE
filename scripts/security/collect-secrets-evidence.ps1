<#
.SYNOPSIS
  Collect READ-ONLY Secrets Manager + ECS secret-posture evidence (Stage 5).

.DESCRIPTION
  Produces auditor evidence WITHOUT ever revealing a secret value:
    - Secrets Manager METADATA only (list-secrets / describe-secret): name, ARN,
      KMS key id, rotation enabled, last-changed / last-accessed dates.
    - ECS task definitions: plaintext env var NAMES only, and Secrets Manager
      injection NAMES only. Flags sensitive-looking PLAINTEXT env var names.

  HARD RULES (enforced by construction):
    * NEVER calls aws secretsmanager get-secret-value.
    * NEVER prints any env var VALUE (only .name is ever read from environment[]).
    * Read-only: no create/update/put/delete, no -Apply path.

  Compatible with Windows PowerShell 5.1 and PowerShell 7+. Pure ASCII.
  Output goes to a git-ignored folder: evidence-pack-output/secrets-<timestamp>.

.PARAMETER Region   AWS region. Default ap-south-1.
.PARAMETER Profile  AWS profile. Default cex-staging (cleared with -Profile '').
.PARAMETER Cluster  ECS cluster. Default cex-staging.
.PARAMETER OutDir   Output folder. Default evidence-pack-output/secrets-<timestamp>.

.EXAMPLE
  ./collect-secrets-evidence.ps1
  ./collect-secrets-evidence.ps1 -Region ap-south-1 -Profile cex-staging
#>
[CmdletBinding()]
param(
  [string]$Region = 'ap-south-1',
  [string]$Profile = 'cex-staging',
  [string]$Cluster = 'cex-staging',
  [string]$OutDir
)

# Continue (not Stop): native aws stderr must not abort before our own checks.
$ErrorActionPreference = 'Continue'

$services = @('cex-staging-api','cex-staging-admin')
# Sensitive-looking PLAINTEXT env var name patterns (NAMES only; never values).
# Per Stage 5 spec: flag names containing any of these tokens.
$sensitivePattern = 'SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL|PRIVATE|JWT|OTP|TOTP|WEBHOOK'
# Of the matches, these NAME shapes are almost certainly a real secret value sat
# in plaintext -> FAIL. The rest (e.g. OTP_TTL_MS, OTP_MAX_ATTEMPTS,
# ALLOW_*_TOTP) are non-secret config that merely contain a keyword -> WARN.
$secretShapedPattern = 'SECRET|TOKEN|PASSWORD|PRIVATE|MNEMONIC|WEBHOOK|API_KEY|_KEY_REF|(^|_)KEY($|_)|DATABASE_URL|REDIS_URL|JWT_'

$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssZ')
if ([string]::IsNullOrWhiteSpace($OutDir)) { $OutDir = Join-Path '.' "evidence-pack-output/secrets-$stamp" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Common AWS arg tail (region + optional profile), built as an array so values
# with spaces/quotes are always passed as single arguments.
$awsTail = @('--region', $Region)
if (-not [string]::IsNullOrWhiteSpace($Profile)) { $awsTail += @('--profile', $Profile) }

function Invoke-AwsJson {
  param([string[]]$ArgList)
  $raw = & aws @ArgList @awsTail --output json 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  $text = ($raw -join "`n")
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  try { return ($text | ConvertFrom-Json) } catch { return $null }
}

$findings = New-Object System.Collections.ArrayList
function Add-Finding {
  param([ValidateSet('PASS','WARN','FAIL')][string]$Level, [string]$Message)
  [void]$findings.Add([pscustomobject]@{ Level = $Level; Message = $Message })
}

Write-Host "EXORA Stage 5 - secrets evidence (READ-ONLY, no values) -> $OutDir" -ForegroundColor Green
Write-Host "Region: $Region  Profile: '$Profile'  Cluster: $Cluster" -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# 1) Secrets Manager metadata (NO values)
# ---------------------------------------------------------------------------
Write-Host "[1/2] Secrets Manager metadata..." -ForegroundColor Cyan
$secMetaPath = Join-Path $OutDir '01-secretsmanager-metadata.txt'
"# Secrets Manager metadata (NO VALUES) - captured $(Get-Date -Format o)" | Out-File $secMetaPath -Encoding ascii
"" | Out-File $secMetaPath -Encoding ascii -Append

$list = Invoke-AwsJson @('secretsmanager','list-secrets','--max-results','100')
if ($null -eq $list -or $null -eq $list.SecretList) {
  "ERROR: list-secrets failed (check AWS credentials / profile / region)." | Out-File $secMetaPath -Encoding ascii -Append
  Add-Finding WARN 'Could not list Secrets Manager secrets (credentials/permissions?).'
} else {
  ("{0,-34} {1,-10} {2,-12} {3}" -f 'NAME','ROTATION','KMS','LAST_CHANGED') | Out-File $secMetaPath -Encoding ascii -Append
  ("-" * 90) | Out-File $secMetaPath -Encoding ascii -Append
  foreach ($s in $list.SecretList) {
    $kms = if ([string]::IsNullOrWhiteSpace($s.KmsKeyId)) { 'aws-managed' } else { 'cmk' }
    $rot = if ($s.RotationEnabled) { 'enabled' } else { 'OFF' }
    $changed = if ($s.LastChangedDate) { ([string]$s.LastChangedDate) } else { 'n/a' }
    ("{0,-34} {1,-10} {2,-12} {3}" -f $s.Name, $rot, $kms, $changed) | Out-File $secMetaPath -Encoding ascii -Append
    "    ARN: $($s.ARN)" | Out-File $secMetaPath -Encoding ascii -Append
    if ($s.LastAccessedDate) { "    LastAccessed: $($s.LastAccessedDate)" | Out-File $secMetaPath -Encoding ascii -Append }

    if (-not $s.RotationEnabled) { Add-Finding WARN "Secret '$($s.Name)' has rotation DISABLED (production requires a rotation policy)." }
    if ([string]::IsNullOrWhiteSpace($s.KmsKeyId)) { Add-Finding WARN "Secret '$($s.Name)' uses the AWS-managed key (production requires a customer-managed KMS CMK)." }
  }
  Add-Finding PASS "Listed $($list.SecretList.Count) Secrets Manager secret(s) (metadata only; no values read)."
}

# ---------------------------------------------------------------------------
# 2) ECS task definitions: env var NAMES + secret injection NAMES (NO values)
# ---------------------------------------------------------------------------
Write-Host "[2/2] ECS task definition secret posture..." -ForegroundColor Cyan
$ecsPath = Join-Path $OutDir '02-ecs-secret-posture.txt'
"# ECS secret posture (NAMES ONLY, NO VALUES) - captured $(Get-Date -Format o)" | Out-File $ecsPath -Encoding ascii
"" | Out-File $ecsPath -Encoding ascii -Append

foreach ($svc in $services) {
  "===== $svc =====" | Out-File $ecsPath -Encoding ascii -Append
  $svcJson = Invoke-AwsJson @('ecs','describe-services','--cluster',$Cluster,'--services',$svc)
  if ($null -eq $svcJson -or $null -eq $svcJson.services -or $svcJson.services.Count -eq 0) {
    "  ERROR: describe-services failed or service not found." | Out-File $ecsPath -Encoding ascii -Append
    Add-Finding WARN "Could not describe service '$svc'."
    continue
  }
  $td = $svcJson.services[0].taskDefinition
  "  Live task definition: $td" | Out-File $ecsPath -Encoding ascii -Append

  $tdJson = Invoke-AwsJson @('ecs','describe-task-definition','--task-definition',$td)
  if ($null -eq $tdJson -or $null -eq $tdJson.taskDefinition) {
    "  ERROR: describe-task-definition failed." | Out-File $ecsPath -Encoding ascii -Append
    Add-Finding WARN "Could not describe task definition for '$svc'."
    continue
  }

  foreach ($c in $tdJson.taskDefinition.containerDefinitions) {
    "  --- container: $($c.name) ---" | Out-File $ecsPath -Encoding ascii -Append

    # Secrets-injected NAMES (good): from secrets[] (valueFrom is a secret ARN).
    $injected = @()
    if ($c.secrets) { $injected = @($c.secrets | ForEach-Object { $_.name }) }
    "  Injected secrets (Secrets Manager): $([string]::Join(', ', $injected))" | Out-File $ecsPath -Encoding ascii -Append
    if ($injected.Count -gt 0) { Add-Finding PASS "$svc/$($c.name): $($injected.Count) secret(s) injected via Secrets Manager." }

    # Plaintext env var NAMES only (NEVER values). environment[] entries carry a
    # value; we deliberately read only .name and never .value.
    $envNames = @()
    if ($c.environment) { $envNames = @($c.environment | ForEach-Object { $_.name }) }
    "  Plaintext env var NAMES ($($envNames.Count)): $([string]::Join(', ', $envNames))" | Out-File $ecsPath -Encoding ascii -Append

    # Flag sensitive-looking plaintext env var NAMES, split by severity.
    $flagged = @($envNames | Where-Object { $_ -match $sensitivePattern })
    $secretShaped = @($flagged | Where-Object { $_ -match $secretShapedPattern })
    $configShaped = @($flagged | Where-Object { $_ -notmatch $secretShapedPattern })
    if ($flagged.Count -gt 0) {
      "  >> PLAINTEXT ENV NAMES MATCHING SENSITIVE PATTERNS: $([string]::Join(', ', $flagged))" | Out-File $ecsPath -Encoding ascii -Append
    }
    if ($secretShaped.Count -gt 0) {
      "  >> SECRET-SHAPED (move to Secrets Manager): $([string]::Join(', ', $secretShaped))" | Out-File $ecsPath -Encoding ascii -Append
      Add-Finding FAIL "$svc/$($c.name): secret-shaped PLAINTEXT env var name(s) [$([string]::Join(', ', $secretShaped))] - must be Secrets Manager-injected (name shown only; value NOT read)."
    }
    if ($configShaped.Count -gt 0) {
      Add-Finding WARN "$svc/$($c.name): plaintext env var name(s) [$([string]::Join(', ', $configShaped))] match a sensitive keyword but look like non-secret config - verify they carry no secret value."
    }
    if ($flagged.Count -eq 0) {
      Add-Finding PASS "$svc/$($c.name): no sensitive-looking plaintext env var names."
    }
  }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
$summaryPath = Join-Path $OutDir '00-summary.txt'
$fail = @($findings | Where-Object { $_.Level -eq 'FAIL' })
$warn = @($findings | Where-Object { $_.Level -eq 'WARN' })
$pass = @($findings | Where-Object { $_.Level -eq 'PASS' })

$lines = @()
$lines += "EXORA Stage 5 - secrets evidence summary"
$lines += "captured: $(Get-Date -Format o)"
$lines += "region: $Region  profile: '$Profile'  cluster: $Cluster"
$lines += ""
$lines += "RESULT: $($fail.Count) FAIL, $($warn.Count) WARN, $($pass.Count) PASS"
$lines += "No secret values were read or printed (get-secret-value NOT called)."
$lines += ""
$lines += "-- FAIL (production blockers) --"
if ($fail.Count -eq 0) { $lines += "  (none)" } else { foreach ($f in $fail) { $lines += "  [FAIL] $($f.Message)" } }
$lines += ""
$lines += "-- WARN --"
if ($warn.Count -eq 0) { $lines += "  (none)" } else { foreach ($f in $warn) { $lines += "  [WARN] $($f.Message)" } }
$lines += ""
$lines += "-- Recommended next actions --"
$lines += "  1. Move any sensitive PLAINTEXT env var to Secrets Manager (task-def secrets[])."
$lines += "  2. Enable rotation on secrets lacking it (see secrets-rotation-runbook.md)."
$lines += "  3. Re-encrypt secrets under a customer-managed KMS CMK (see kms-readiness.md)."
$lines += "  4. Run the IAM least-privilege evidence (iam-least-privilege-readiness.md)."
$lines | Out-File $summaryPath -Encoding ascii

# Console echo (findings only; no values).
Write-Host ""
Write-Host "RESULT: $($fail.Count) FAIL, $($warn.Count) WARN, $($pass.Count) PASS" -ForegroundColor $(if ($fail.Count -gt 0) { 'Red' } elseif ($warn.Count -gt 0) { 'Yellow' } else { 'Green' })
foreach ($f in $fail) { Write-Host "  [FAIL] $($f.Message)" -ForegroundColor Red }
foreach ($f in $warn) { Write-Host "  [WARN] $($f.Message)" -ForegroundColor Yellow }
Write-Host ""
Write-Host "Evidence written to: $OutDir" -ForegroundColor Green
Write-Host "No secret values were read (get-secret-value NOT called). Do NOT commit evidence output." -ForegroundColor Yellow
