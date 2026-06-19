# Deployment Verification Checklist (Stage 3.5)

Run after every staging deploy. Replace placeholders (`<…>`) with real values.
`BASE` = CloudFront distribution, e.g. `https://dfk68tws8g8oj.cloudfront.net`.

```bash
BASE=https://dfk68tws8g8oj.cloudfront.net
ADMIN_EMAIL=admin@exchange.local
ADMIN_PASSWORD='<set-in-secrets>'
```

## 1. Public API health
```bash
curl -fsS "$BASE/health"            # -> {"status":"ok",...}
curl -fsS "$BASE/api/v1/markets"    # -> 200, markets array (USDT-INR)
```

## 2. Admin API reachable + correctly routed
```bash
curl -fsS "$BASE/admin/v1/ping"     # -> {"success":true,"data":{"surface":"admin","status":"ok"}}
# If this 404s as "Route not found", the admin ECS task is running the public
# server (dist/server.js) instead of dist/admin-server.js — fix the task command.
```

## 3. Admin login + roles
```bash
TOKEN=$(curl -fsS -X POST "$BASE/admin/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"totp\":\"000000\"}" \
  | jq -r '.data.tokens.accessToken')

curl -fsS "$BASE/admin/v1/auth/me" -H "Authorization: Bearer $TOKEN" \
  | jq '{roles:.data.roles, permissions:.data.permissions}'
# Expect roles to include "SUPER_ADMIN".
```

## 4. INR deposits API (no FORBIDDEN)
```bash
curl -fsS -o /dev/null -w '%{http_code}\n' \
  "$BASE/admin/v1/inr/deposits?status=PENDING" -H "Authorization: Bearer $TOKEN"
# Expect 200 (not 403).

curl -fsS "$BASE/admin/v1/operations/summary" -H "Authorization: Bearer $TOKEN" \
  | jq '.data.inrDeposits, .data.dualApprovalThreshold'
```

## 5. ECS service revision verification
```bash
aws ecs describe-services --cluster cex-staging \
  --services cex-staging-api cex-staging-admin \
  --query 'services[].{name:serviceName,desired:desiredCount,running:runningCount,taskDef:taskDefinition}'
# desired == running, taskDef points at the revision you just deployed.

# Admin task MUST run the admin entrypoint:
aws ecs describe-task-definition --task-definition cex-staging-admin \
  --query 'taskDefinition.containerDefinitions[0].command'
# Expect ["node","dist/admin-server.js"].
```

## 6. One-shot maintenance tasks (env-guarded — never run without the flag)
```bash
# Apply migrations
... run-task ... command=["npx","prisma","migrate","deploy"]
# Ensure RBAC roles/permissions
... command=["node","dist/scripts/ensure-admin-rbac.js"] env ALLOW_STAGING_RBAC_SEED=YES
# (Re)set SUPER_ADMIN credentials
... command=["node","dist/scripts/reset-staging-admin.js"] env ALLOW_STAGING_ADMIN_RESET=YES RESET_ADMIN_PASSWORD=<strong>
# Approve a test user's KYC for demo
... command=["node","dist/scripts/approve-staging-kyc.js"] env ALLOW_STAGING_KYC_APPROVE=YES KYC_APPROVE_EMAIL=<user>
```

## 7. CloudFront invalidation (after frontend or static deploy)
```bash
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths '/*'
aws cloudfront get-invalidation --distribution-id <DIST_ID> --id <INVALIDATION_ID> \
  --query 'Invalidation.Status'   # -> "Completed"
```

## 8. Frontend smoke
- Open `$BASE/login` and `$BASE/admin/login` — both render.
- Admin dashboard shows **live** operational counts (top cards) + a clearly
  labelled "Sample data" banner over the decorative charts.
