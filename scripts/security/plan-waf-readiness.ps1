<#
.SYNOPSIS
  Plan (and optionally create) a staging-safe AWS WAF WebACL for CloudFront.

.DESCRIPTION
  Stage 6 admin-edge readiness. DRY-RUN BY DEFAULT: prints the proposed WebACL
  name, rules, priorities, default action, and association target, with cost +
  false-positive warnings. Makes NO AWS changes unless -Apply is passed.

  Even with -Apply it:
    * requires -ConfirmCreate as a second explicit acknowledgement,
    * creates managed rule groups in COUNT (monitor) mode with default action
      ALLOW (cannot hard-block legitimate traffic),
    * does NOT associate the WebACL to CloudFront unless -AssociateToCloudFront
      is ALSO passed.

  CLOUDFRONT-scope WAF is global and MUST be created in us-east-1.
  Compatible with Windows PowerShell 5.1 and PowerShell 7+. Pure ASCII.

.PARAMETER WebAclName        Proposed WebACL name. Default cex-staging-cloudfront-acl.
.PARAMETER DistributionId    CloudFront distribution id. Default E36DO8GL4SA61N.
.PARAMETER Profile           AWS profile. Default cex-staging (cleared with '').
.PARAMETER Apply             Create the WebACL (paid). Requires -ConfirmCreate.
.PARAMETER ConfirmCreate     Second explicit acknowledgement for -Apply.
.PARAMETER AssociateToCloudFront  Also associate the WebACL to the distribution.

.EXAMPLE
  ./plan-waf-readiness.ps1                              # dry-run plan only
  ./plan-waf-readiness.ps1 -Apply -ConfirmCreate        # create (monitor mode), NOT associated
#>
[CmdletBinding()]
param(
  [string]$WebAclName = 'cex-staging-cloudfront-acl',
  [string]$DistributionId = 'E36DO8GL4SA61N',
  [string]$Profile = 'cex-staging',
  [switch]$Apply,
  [switch]$ConfirmCreate,
  [switch]$AssociateToCloudFront
)

# Continue: native aws stderr must not abort before our own checks.
$ErrorActionPreference = 'Continue'

# CLOUDFRONT-scope WAF is global -> us-east-1, regardless of the app's region.
$WafRegion = 'us-east-1'
$awsTail = @('--region', $WafRegion)
if (-not [string]::IsNullOrWhiteSpace($Profile)) { $awsTail += @('--profile', $Profile) }

# Managed rule groups (all start in COUNT/monitor mode).
$managedRules = @(
  [pscustomobject]@{ Priority=1; Name='common';        Vendor='AWS'; Group='AWSManagedRulesCommonRuleSet';          Mode='COUNT' }
  [pscustomobject]@{ Priority=2; Name='known-bad';      Vendor='AWS'; Group='AWSManagedRulesKnownBadInputsRuleSet';  Mode='COUNT' }
  [pscustomobject]@{ Priority=3; Name='ip-reputation';  Vendor='AWS'; Group='AWSManagedRulesAmazonIpReputationList'; Mode='COUNT' }
  [pscustomobject]@{ Priority=4; Name='sqli';           Vendor='AWS'; Group='AWSManagedRulesSQLiRuleSet';            Mode='COUNT' }
  # AnonymousIpList is optional + high false-positive; left out of the default plan.
)

# Rate-based rules (per source IP, 5-min window). COUNT first.
$rateRules = @(
  [pscustomobject]@{ Priority=10; Name='rate-admin'; Limit=100;  Scope='/admin/v1*'; Mode='COUNT' }
  [pscustomobject]@{ Priority=11; Name='rate-auth';  Limit=300;  Scope='/api/v1/auth*'; Mode='COUNT' }
  [pscustomobject]@{ Priority=12; Name='rate-api';   Limit=2000; Scope='all requests'; Mode='COUNT' }
)

Write-Host "EXORA Stage 6 - WAF readiness plan" -ForegroundColor Cyan
Write-Host "Mode: $(if ($Apply) { 'APPLY' } else { 'DRY RUN (no AWS changes)' })" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proposed WebACL:" -ForegroundColor White
Write-Host "  Name:           $WebAclName"
Write-Host "  Scope:          CLOUDFRONT (global; created in $WafRegion)"
Write-Host "  Default action: ALLOW (monitor-first; rules start in COUNT)"
Write-Host "  Association:    $(if ($AssociateToCloudFront) { "CloudFront $DistributionId" } else { 'NONE (not associated)' })"
Write-Host ""
Write-Host "  Managed rule groups (COUNT/monitor mode):" -ForegroundColor White
foreach ($r in $managedRules) {
  Write-Host ("    [{0}] {1}/{2}  -> {3}" -f $r.Priority, $r.Vendor, $r.Group, $r.Mode)
}
Write-Host "  Rate-based rules (per IP, 5-min, COUNT mode):" -ForegroundColor White
foreach ($r in $rateRules) {
  Write-Host ("    [{0}] {1}  limit={2}  scope={3}  -> {4}" -f $r.Priority, $r.Name, $r.Limit, $r.Scope, $r.Mode)
}
Write-Host ""
Write-Host "WARNINGS:" -ForegroundColor Yellow
Write-Host "  * AWS WAF is a PAID resource (per WebACL + per rule + per request)." -ForegroundColor Yellow
Write-Host "  * Managed groups can FALSE-POSITIVE on JSON/base64 bodies (KYC upload," -ForegroundColor Yellow
Write-Host "    signatures). Keep them in COUNT, review sampled requests, then flip." -ForegroundColor Yellow
Write-Host "  * The live www.exorain.com frontend is on VERCEL, not this CloudFront." -ForegroundColor Yellow
Write-Host "    AWS WAF here only covers traffic through $DistributionId. Confirm" -ForegroundColor Yellow
Write-Host "    what the distribution fronts before relying on it (see waf-readiness-plan.md)." -ForegroundColor Yellow
Write-Host ""

if (-not $Apply) {
  Write-Host "Read-only evidence (current WAF association):" -ForegroundColor Cyan
  Write-Host "  aws cloudfront get-distribution-config --id $DistributionId --query DistributionConfig.WebACLId --output text $($awsTail -join ' ')"
  Write-Host "  aws wafv2 list-web-acls --scope CLOUDFRONT $($awsTail -join ' ')"
  Write-Host ""
  Write-Host "DRY RUN complete. No AWS changes made." -ForegroundColor Green
  Write-Host "To create (monitor mode, NOT associated): -Apply -ConfirmCreate" -ForegroundColor Green
  return
}

# ----- APPLY path (guarded) -----
if (-not $ConfirmCreate) {
  Write-Host "REFUSING to create: pass -ConfirmCreate to acknowledge a PAID WAF WebACL will be created." -ForegroundColor Red
  return
}

# Build the rules JSON for create-web-acl and write to a temp file (avoids any
# shell-quoting issues with complex inline JSON across PowerShell versions).
$ruleObjects = @()
foreach ($r in $managedRules) {
  $ruleObjects += [ordered]@{
    Name = $r.Name; Priority = $r.Priority
    Statement = @{ ManagedRuleGroupStatement = @{ VendorName = $r.Vendor; Name = $r.Group } }
    OverrideAction = @{ Count = @{} }   # COUNT/monitor mode for managed groups
    VisibilityConfig = @{ SampledRequestsEnabled = $true; CloudWatchMetricsEnabled = $true; MetricName = $r.Name }
  }
}
foreach ($r in $rateRules) {
  $ruleObjects += [ordered]@{
    Name = $r.Name; Priority = $r.Priority
    Statement = @{ RateBasedStatement = @{ Limit = $r.Limit; AggregateKeyType = 'IP' } }
    Action = @{ Count = @{} }           # COUNT first; flip to Block after tuning
    VisibilityConfig = @{ SampledRequestsEnabled = $true; CloudWatchMetricsEnabled = $true; MetricName = $r.Name }
  }
}
$rulesPath = Join-Path ([System.IO.Path]::GetTempPath()) ("waf-rules-{0}.json" -f ([DateTime]::UtcNow.ToString('yyyyMMddHHmmss')))
($ruleObjects | ConvertTo-Json -Depth 12) | Out-File -FilePath $rulesPath -Encoding ascii

Write-Host "Creating WebACL '$WebAclName' (default ALLOW, rules in COUNT) in $WafRegion..." -ForegroundColor Yellow
& aws wafv2 create-web-acl `
  --name $WebAclName `
  --scope CLOUDFRONT `
  --default-action "Allow={}" `
  --visibility-config "SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=$WebAclName" `
  --rules ("file://" + $rulesPath) `
  @awsTail
if ($LASTEXITCODE -ne 0) { Write-Host "create-web-acl failed (exit $LASTEXITCODE)." -ForegroundColor Red; return }
Write-Host "[CREATED] WebACL '$WebAclName' (rules in COUNT mode; NOT associated)." -ForegroundColor Green

if ($AssociateToCloudFront) {
  Write-Host "Association to CloudFront requires updating the distribution's WebACLId" -ForegroundColor Yellow
  Write-Host "via get-distribution-config + update-distribution (ETag-guarded). NOT done" -ForegroundColor Yellow
  Write-Host "automatically here to avoid an unintended edge change. See waf-readiness-plan.md." -ForegroundColor Yellow
} else {
  Write-Host "Not associated to CloudFront (by design). Review counts before associating." -ForegroundColor Green
}
