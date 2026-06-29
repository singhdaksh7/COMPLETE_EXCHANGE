<#
.SYNOPSIS
  Collect EXORA staging audit evidence into a timestamped folder (read-only).

.DESCRIPTION
  Stage 4 - audit evidence pack. Runs a fixed set of READ-ONLY AWS + git
  commands and saves each output to a file under -OutDir. Nothing here mutates
  AWS or the repo. Intended to produce the artifacts referenced by
  docs/security/evidence-pack/README.md.

  Requires: AWS CLI configured with read access, git on PATH. Sections that
  need a parameter (CloudFront id, ECR repo) are skipped with a note if the
  parameter is absent - they never fail the run.

.PARAMETER OutDir        Output folder. Default ./evidence-pack-output/<UTC-timestamp>.
.PARAMETER Region        AWS region. Default ap-south-1.
.PARAMETER EcsCluster    ECS cluster. Default cex-staging.
.PARAMETER CloudFrontId  Optional CloudFront distribution id for frontend evidence.
.PARAMETER EcrRepo       Optional ECR repository name (e.g. cex-staging-backend).
.PARAMETER RdsInstanceId Optional RDS instance identifier for backup evidence.

.EXAMPLE
  ./collect-evidence.ps1
  ./collect-evidence.ps1 -EcrRepo cex-staging-backend -CloudFrontId E123ABC -RdsInstanceId cex-staging-db
#>
[CmdletBinding()]
param(
  [string]$OutDir,
  [string]$Region = 'ap-south-1',
  [string]$EcsCluster = 'cex-staging',
  [string]$CloudFrontId = '',
  [string]$EcrRepo = '',
  [string]$RdsInstanceId = ''
)

$ErrorActionPreference = 'Continue'   # keep going even if one section fails
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssZ')   # -AsUTC is PS7-only; this works on 5.1 too
if ([string]::IsNullOrWhiteSpace($OutDir)) { $OutDir = Join-Path '.' "evidence-pack-output/$stamp" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$services = @('cex-staging-api','cex-staging-admin','cex-staging-worker','cex-staging-scanner')
$logGroups = @('/ecs/cex-staging/api','/ecs/cex-staging/admin','/ecs/cex-staging/worker','/ecs/cex-staging/scanner','/ecs/cex-staging/migrate','/ecs/cex-staging/testnet-tools')

function Save-Step {
  param([string]$File, [string]$Title, [scriptblock]$Body)
  $path = Join-Path $OutDir $File
  Write-Host "[collect] $Title -> $File" -ForegroundColor Cyan
  "# $Title"            | Out-File -FilePath $path -Encoding utf8
  "# captured: $(Get-Date -Format o)" | Out-File -FilePath $path -Encoding utf8 -Append
  "" | Out-File -FilePath $path -Encoding utf8 -Append
  try { & $Body 2>&1 | Out-File -FilePath $path -Encoding utf8 -Append }
  catch { "ERROR: $($_.Exception.Message)" | Out-File -FilePath $path -Encoding utf8 -Append }
}

Write-Host "EXORA Stage 4 evidence collection -> $OutDir" -ForegroundColor Green
Write-Host "Region: $Region  Cluster: $EcsCluster" -ForegroundColor Green
Write-Host ""

# 1) ECS services: running/desired count + task def revision
Save-Step '01-ecs-services.txt' 'ECS services - running/desired count + task def' {
  aws ecs describe-services --cluster $EcsCluster --services $services --region $Region `
    --query 'services[].{name:serviceName,status:status,desired:desiredCount,running:runningCount,taskDef:taskDefinition}' `
    --output table
}

# 2) ECS task definitions (image + env safety flags) for api & admin
Save-Step '02-ecs-taskdefs.txt' 'ECS task definitions - image + environment (safety flags)' {
  foreach ($svc in @('cex-staging-api','cex-staging-admin')) {
    "===== $svc ====="
    aws ecs describe-task-definition --task-definition $svc --region $Region `
      --query 'taskDefinition.{family:family,revision:revision,containers:containerDefinitions[].{name:name,image:image,env:environment}}' `
      --output json
  }
}

# 3) CloudWatch log group retention
Save-Step '03-log-retention.txt' 'CloudWatch log group retention' {
  foreach ($lg in $logGroups) {
    aws logs describe-log-groups --log-group-name-prefix $lg --region $Region `
      --query "logGroups[?logGroupName=='$lg'].{name:logGroupName,retentionDays:retentionInDays,storedBytes:storedBytes}" `
      --output table
  }
}

# 4) Recent security/error logs (last 1h) from api + admin
Save-Step '04-recent-error-logs.txt' 'Recent error-level logs (last 1h, redacted at source)' {
  $start = [DateTimeOffset]::UtcNow.AddHours(-1).ToUnixTimeMilliseconds()
  foreach ($lg in @('/ecs/cex-staging/api','/ecs/cex-staging/admin')) {
    "===== $lg ====="
    aws logs filter-log-events --log-group-name $lg --start-time $start `
      --filter-pattern '{ $.level = "error" }' --region $Region `
      --query 'events[].message' --output text
  }
}

# 5) Recent auth/admin security events (last 24h) from CloudWatch (proxy)
Save-Step '05-recent-auth-events.txt' 'Recent auth/admin events (last 24h, CloudWatch proxy)' {
  $start = [DateTimeOffset]::UtcNow.AddHours(-24).ToUnixTimeMilliseconds()
  "Note: authoritative auth/admin audit trail is the DB (audit_logs/admin_logs)."
  "See docs/security/evidence-pack/README.md for the SQL to export it."
  ""
  aws logs filter-log-events --log-group-name '/ecs/cex-staging/admin' --start-time $start `
    --filter-pattern '{ $.res.statusCode = 401 }' --region $Region `
    --query 'events[].message' --output text
}

# 6) ECR images / tags
Save-Step '06-ecr-images.txt' 'ECR image tags' {
  if ([string]::IsNullOrWhiteSpace($EcrRepo)) { "SKIPPED: pass -EcrRepo <name>. List repos: aws ecr describe-repositories --region $Region" }
  else {
    aws ecr describe-images --repository-name $EcrRepo --region $Region `
      --query 'reverse(sort_by(imageDetails,&imagePushedAt))[:10].{tags:imageTags,pushed:imagePushedAt,digest:imageDigest}' `
      --output table
  }
}

# 7) CloudFront + S3 frontend evidence
Save-Step '07-cloudfront-s3.txt' 'CloudFront distribution + S3 frontend' {
  if ([string]::IsNullOrWhiteSpace($CloudFrontId)) {
    "SKIPPED CloudFront detail: pass -CloudFrontId. Listing all distributions:"
    aws cloudfront list-distributions --query 'DistributionList.Items[].{id:Id,domain:DomainName,enabled:Enabled,origins:Origins.Items[].DomainName}' --output table
  } else {
    aws cloudfront get-distribution --id $CloudFrontId `
      --query 'Distribution.{id:Id,domain:DomainName,status:Status,enabled:DistributionConfig.Enabled,origins:DistributionConfig.Origins.Items[].DomainName}' `
      --output table
  }
}

# 8) RDS snapshots / backup status
Save-Step '08-rds-backups.txt' 'RDS automated backups + snapshots' {
  if ([string]::IsNullOrWhiteSpace($RdsInstanceId)) {
    "SKIPPED instance detail: pass -RdsInstanceId. Listing instances:"
    aws rds describe-db-instances --region $Region `
      --query 'DBInstances[].{id:DBInstanceIdentifier,retentionDays:BackupRetentionPeriod,window:PreferredBackupWindow,multiAZ:MultiAZ}' --output table
  } else {
    aws rds describe-db-instances --db-instance-identifier $RdsInstanceId --region $Region `
      --query 'DBInstances[].{id:DBInstanceIdentifier,retentionDays:BackupRetentionPeriod,window:PreferredBackupWindow,multiAZ:MultiAZ,storageEncrypted:StorageEncrypted}' --output table
    "----- recent snapshots -----"
    aws rds describe-db-snapshots --db-instance-identifier $RdsInstanceId --region $Region `
      --query 'reverse(sort_by(DBSnapshots,&SnapshotCreateTime))[:5].{id:DBSnapshotIdentifier,type:SnapshotType,created:SnapshotCreateTime,status:Status}' --output table
  }
}

# 9) CloudWatch alarms state
Save-Step '09-cloudwatch-alarms.txt' 'CloudWatch alarms (cex-staging-*)' {
  aws cloudwatch describe-alarms --alarm-name-prefix cex-staging --region $Region `
    --query 'MetricAlarms[].{name:AlarmName,state:StateValue,metric:MetricName,threshold:Threshold}' --output table
}

# 10) Git tag / commit evidence (local repo)
Save-Step '10-git-evidence.txt' 'Git commit / tag evidence' {
  "----- HEAD -----";    git rev-parse HEAD
  "----- branch -----";  git rev-parse --abbrev-ref HEAD
  "----- last 10 commits -----"; git log --oneline -n 10
  "----- tags -----";    git tag --sort=-creatordate
  "----- tracked .env / taskdef leak check (should be empty / *.example only) -----"
  git ls-files | Select-String -Pattern '\.env$|\.env\.|taskdef|overrides\.json|cex-staging-.*\.json'
}

Write-Host ""
Write-Host "Evidence written to: $OutDir" -ForegroundColor Green
Write-Host "Review files, then hand to the auditor. Do NOT commit raw evidence (may contain infra identifiers)." -ForegroundColor Yellow
