# Deployment Verification Checklist

Run after every staging deploy. Replace placeholders with real values.

## PowerShell Setup

```powershell
$BASE = "https://<cloudfront-domain>"
$ADMIN_EMAIL = "admin@exchange.local"
$ADMIN_PASSWORD = "<set-in-secrets>"
$USER_EMAIL = "<test-user@example.com>"
$USER_PASSWORD = "<test-user-password>"
```

## CMD Setup

```cmd
set BASE=https://<cloudfront-domain>
set ADMIN_EMAIL=admin@exchange.local
set ADMIN_PASSWORD=<set-in-secrets>
set USER_EMAIL=<test-user@example.com>
set USER_PASSWORD=<test-user-password>
```

## 1. ECS Service Revisions

PowerShell:

```powershell
aws ecs describe-services `
  --cluster cex-staging `
  --services cex-staging-api cex-staging-admin cex-staging-scanner `
  --query "services[].{name:serviceName,desired:desiredCount,running:runningCount,taskDef:taskDefinition,rollout:deployments[0].rolloutState}"
```

CMD:

```cmd
aws ecs describe-services --cluster cex-staging --services cex-staging-api cex-staging-admin cex-staging-scanner --query "services[].{name:serviceName,desired:desiredCount,running:runningCount,taskDef:taskDefinition,rollout:deployments[0].rolloutState}"
```

Expected: desired equals running, rollout is completed, and task definitions are the newly deployed revisions.

Verify admin entrypoint:

```powershell
aws ecs describe-task-definition --task-definition cex-staging-admin --query "taskDefinition.containerDefinitions[0].command"
```

Expected: `["node","dist/admin-server.js"]`.

## 2. Health Checks

PowerShell:

```powershell
Invoke-RestMethod "$BASE/health"
Invoke-RestMethod "$BASE/api/v1/health"
Invoke-RestMethod "$BASE/admin/v1/health"
Invoke-RestMethod "$BASE/ready"
Invoke-RestMethod "$BASE/admin/v1/ready"
```

CMD:

```cmd
curl -fsS "%BASE%/health"
curl -fsS "%BASE%/api/v1/health"
curl -fsS "%BASE%/admin/v1/health"
curl -fsS "%BASE%/ready"
curl -fsS "%BASE%/admin/v1/ready"
```

Expected: `/health` returns safe service metadata. `/ready` returns `status: ok` with database and redis checks `ok`.

## 3. Public App Smoke

```powershell
Invoke-RestMethod "$BASE/api/v1/markets"
Invoke-WebRequest "$BASE/trade" -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest "$BASE/security" -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest "$BASE/transactions" -UseBasicParsing | Select-Object StatusCode
```

Expected: markets includes `USDT-INR`; pages return 200.

## 4. Admin Login + Roles

PowerShell:

```powershell
$adminBody = @{
  email = $ADMIN_EMAIL
  password = $ADMIN_PASSWORD
  totp = "000000"
} | ConvertTo-Json

$adminLogin = Invoke-RestMethod "$BASE/admin/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $adminBody

$ADMIN_TOKEN = $adminLogin.data.tokens.accessToken
Invoke-RestMethod "$BASE/admin/v1/auth/me" -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
```

Expected: roles include `SUPER_ADMIN`; permissions include admin/user/risk permissions.

## 5. User Login

PowerShell:

```powershell
$userBody = @{
  email = $USER_EMAIL
  password = $USER_PASSWORD
} | ConvertTo-Json

$userLogin = Invoke-RestMethod "$BASE/api/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $userBody

$USER_TOKEN = $userLogin.data.tokens.accessToken
Invoke-RestMethod "$BASE/api/v1/auth/me" -Headers @{ Authorization = "Bearer $USER_TOKEN" }
```

Expected: authenticated user profile returns cleanly.

## 6. Admin Operations

```powershell
Invoke-RestMethod "$BASE/admin/v1/inr/deposits?status=PENDING" -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
Invoke-RestMethod "$BASE/admin/v1/operations/summary" -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
Invoke-RestMethod "$BASE/admin/v1/users?email=$USER_EMAIL" -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
```

Expected: no `403`; operations summary and users list return live backend data.

## 7. Manual INR Deposit Flow

1. User opens `/deposit`.
2. User submits a manual INR deposit with a unique UTR.
3. Admin opens `/admin/deposits`.
4. Admin approves a below-threshold deposit.
5. User INR balance increases.

Maker-checker large deposit:

1. User submits amount at or above `MANUAL_INR_DUAL_APPROVAL_THRESHOLD`.
2. First admin approval records first approval only.
3. Same admin cannot give second approval.
4. Different admin gives second approval.
5. User INR balance increases once.

## 8. Admin Users / Risk Controls

1. Admin opens `/admin/users`.
2. Search user by email.
3. Open `/admin/users/detail?id=<userId>`.
4. Add a risk note.
5. Freeze user; verify user cannot place order or withdraw.
6. Unfreeze user.
7. Block withdrawals only; verify user can trade but cannot withdraw.
8. Unblock withdrawals.
9. Check `/admin/audit` or operations audit for admin actions.

## 9. CloudFront

```powershell
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
aws cloudfront get-invalidation --distribution-id <DIST_ID> --id <INVALIDATION_ID> --query "Invalidation.Status"
```

Expected: `Completed`.

## 10. CloudWatch Logs

Log groups:

- `/ecs/cex-staging/api`
- `/ecs/cex-staging/admin`
- `/ecs/cex-staging/scanner`

Recent errors:

```powershell
aws logs filter-log-events --log-group-name "/ecs/cex-staging/api" --filter-pattern "ERROR" --limit 25
aws logs filter-log-events --log-group-name "/ecs/cex-staging/admin" --filter-pattern "ERROR" --limit 25
aws logs filter-log-events --log-group-name "/ecs/cex-staging/scanner" --filter-pattern "ERROR" --limit 25
```

Failed tasks / rollout issues:

```powershell
aws ecs list-tasks --cluster cex-staging --desired-status STOPPED --max-results 10
aws ecs describe-tasks --cluster cex-staging --tasks <task-arn>
aws ecs describe-services --cluster cex-staging --services cex-staging-api cex-staging-admin cex-staging-scanner --query "services[].events[0:10]"
```

## 11. Env-Guarded Maintenance

Run only as explicit one-shot ECS tasks with the documented guard env var.

```powershell
# Apply migrations
npx prisma migrate deploy

# Ensure RBAC roles/permissions
node dist/scripts/ensure-admin-rbac.js
# env: ALLOW_STAGING_RBAC_SEED=YES

# Reset staging admin
node dist/scripts/reset-staging-admin.js
# env: ALLOW_STAGING_ADMIN_RESET=YES RESET_ADMIN_PASSWORD=<strong>

# Approve demo KYC
node dist/scripts/approve-staging-kyc.js
# env: ALLOW_STAGING_KYC_APPROVE=YES KYC_APPROVE_EMAIL=<user>

# Seed demo market
node dist/scripts/seed-demo-market.js
# env: ALLOW_STAGING_MARKET_SEED=YES DEMO_USER_EMAIL=<funded-user>
```
