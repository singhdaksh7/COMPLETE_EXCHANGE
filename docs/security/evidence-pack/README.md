# EXORA — Staging Audit Evidence Pack

**Status: EVIDENCE PACK — staging/demo (INR_ONLY).**
**Stage:** 4 — CloudWatch retention, alerts, and audit evidence.
**Environment:** AWS staging only, region `ap-south-1`, cluster `cex-staging`.

This pack tells an auditor *what controls exist*, *how to verify each one*, and
*which exact commands produce the evidence*. It does **not** assert an
independent VAPT or regulatory certification — those are production blockers
([`../../compliance/production-blockers.md`](../../compliance/production-blockers.md)).
It complements the existing [`../vapt-evidence-pack.md`](../vapt-evidence-pack.md)
(code-level evidence index) with **runtime/infra** evidence.

> **One command for most of it:**
> `./scripts/observability/collect-evidence.ps1` writes a timestamped folder of
> read-only AWS + git evidence. Sections below explain each artifact and give
> the raw commands.

---

## 1. Stage summary

| Item | Value |
|---|---|
| Mode | **INR_ONLY** — all crypto rails globally disabled |
| Region | `ap-south-1` (Mumbai — Indian jurisdiction) |
| Cluster | `cex-staging` |
| Live task defs (post-hotfix) | API `cex-staging-api:56`, Admin `cex-staging-admin:54` |
| Log retention target | **180 days** (CERT-In) |
| IaC | none in repo — controls applied via scripts in `scripts/observability/` |
| Stage 4 changes | docs + PowerShell scripts only; **no app/runtime change, no DB migration, no deploy** |

## 2. Controls implemented so far (with evidence pointers)

| # | Control | Evidence pointer |
|---|---|---|
| C1 | Structured JSON logging with secret/PII redaction | `backend/src/lib/logger.ts` (`redactPaths`) |
| C2 | Append-only audit trails (`audit_logs`, `admin_logs`) — DB trigger rejects UPDATE/DELETE | migration `reject_mutation`; `backend/src/lib/audit.ts` |
| C3 | Password hashing (Argon2id), refresh rotation + reuse detection, login lockout | `backend/src/modules/auth/auth.service.ts` |
| C4 | User 2FA (TOTP) + backup codes; step-up re-auth before withdrawal/address change | `backend/src/modules/user-security/`, `backend/src/middleware/require-step-up.ts`; [`../user-2fa-step-up-auth.md`](../user-2fa-step-up-auth.md) |
| C5 | Admin RBAC, per-admin IP allowlist, admin TOTP, maker-checker on approvals | `backend/src/middleware/admin-*.ts`, `admin-rbac.service.ts` |
| C6 | INR deposit/withdrawal with dual-approval + ledger reserve/release | `backend/src/modules/deposit/`, `backend/src/modules/inr-withdrawal/` |
| C7 | Crypto disabled (global INR_ONLY); live withdrawal signing throws | `feature-controls.types.ts`, `withdrawal/providers/index.ts` |
| C8 | Production-safety boot guards (mock providers/signer/mail require explicit `ALLOW_*`) | `backend/src/lib/prod-safety.ts` |
| **C9** | **CloudWatch log retention = 180 days** (Stage 4) | `scripts/observability/{set,verify}-log-retention.ps1`; [`../log-retention-runbook.md`](../log-retention-runbook.md) |
| **C10** | **CloudWatch metric filters + alarms** (Stage 4) | `scripts/observability/create-cloudwatch-alarms.ps1`; [`../cloudwatch-alarms-plan.md`](../cloudwatch-alarms-plan.md) |
| **C11** | **Alert + retention runbooks** (Stage 4) | [`../alert-runbook.md`](../alert-runbook.md), [`../log-retention-runbook.md`](../log-retention-runbook.md) |

## 3. How to verify each control + evidence commands

All commands are region `ap-south-1`. PowerShell helpers live in
`scripts/observability/`. Outputs land in the `collect-evidence.ps1` folder
(file name noted as `→ NN-name.txt`).

### 3.1 ECS service state — task defs + running count → `01-ecs-services.txt`
```bash
aws ecs describe-services --cluster cex-staging \
  --services cex-staging-api cex-staging-admin cex-staging-worker cex-staging-scanner \
  --query 'services[].{name:serviceName,desired:desiredCount,running:runningCount,taskDef:taskDefinition}' \
  --output table --region ap-south-1
```
Expect API on `:56`, Admin on `:54`, `running == desired`.

### 3.2 CloudWatch log retention → `03-log-retention.txt`
```powershell
./scripts/observability/verify-log-retention.ps1 -Region ap-south-1
```
Expect every `/ecs/cex-staging/*` group at `180` days. See
[`../log-retention-runbook.md`](../log-retention-runbook.md).

### 3.3 Recent security/error logs → `04-recent-error-logs.txt`
```bash
aws logs filter-log-events --log-group-name /ecs/cex-staging/api \
  --start-time $(($(date +%s)-3600))000 \
  --filter-pattern '{ $.level = "error" }' --region ap-south-1
```
Spot-check: **no** raw PAN/Aadhaar/tokens/secrets (redaction at `logger.ts`).

### 3.4 Auth / admin audit logs (authoritative = DB) → `05-recent-auth-events.txt`
The system of record is the append-only DB trail, not CloudWatch. Export it:
```sql
-- Admin auth events, last 24h:
SELECT action, actor_id, ip, created_at
FROM admin_logs
WHERE action IN ('auth.login_failed','auth.login_locked')
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

-- User auth events, last 24h:
SELECT action, actor_id, ip, created_at
FROM audit_logs
WHERE action IN ('auth.login_failed','auth.login_locked','auth.token_reuse_detected','auth.otp_locked')
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
```
Action codes: `backend/src/lib/audit.ts`. Run via your read-only DB path; do not
expose the DB publicly.

### 3.5 INR_ONLY / crypto-disabled proof → `02-ecs-taskdefs.txt`
Two layers of evidence:

**(a) Runtime env** — the deployed task def must NOT enable crypto:
```bash
aws ecs describe-task-definition --task-definition cex-staging-api \
  --query 'taskDefinition.containerDefinitions[].environment[?contains(name, `CRYPTO`)]' \
  --output table --region ap-south-1
```
Expect `CRYPTO_DEPOSITS_GLOBAL_ENABLED`, `CRYPTO_WITHDRAWALS_GLOBAL_ENABLED`,
`CRYPTO_WALLET_GLOBAL_ENABLED` to be **false or absent** (absent ⇒ default OFF;
`config/index.ts`, `feature-controls.types.ts`).

**(b) Live API echo** — an authenticated `/auth/me` returns
`globalFeatureStatus.mode`:
```bash
curl -fsS https://<staging-api>/api/v1/auth/me -H "Authorization: Bearer <token>" \
  | jq '.data.globalFeatureStatus.mode'      # expect "INR_ONLY"
```

### 3.6 CloudFront / S3 frontend → `07-cloudfront-s3.txt`
```bash
aws cloudfront get-distribution --id <DISTRIBUTION_ID> \
  --query 'Distribution.{status:Status,enabled:DistributionConfig.Enabled,origins:DistributionConfig.Origins.Items[].DomainName}' \
  --output table --region ap-south-1
```

### 3.7 RDS backups / snapshots → `08-rds-backups.txt`
```bash
aws rds describe-db-instances --db-instance-identifier <RDS_ID> \
  --query 'DBInstances[].{retentionDays:BackupRetentionPeriod,window:PreferredBackupWindow,encrypted:StorageEncrypted}' \
  --output table --region ap-south-1
aws rds describe-db-snapshots --db-instance-identifier <RDS_ID> \
  --query 'reverse(sort_by(DBSnapshots,&SnapshotCreateTime))[:5].{id:DBSnapshotIdentifier,created:SnapshotCreateTime,status:Status}' \
  --output table --region ap-south-1
```
See also [`../backup-restore-drill.md`](../backup-restore-drill.md).

### 3.8 ECR image / tag → `06-ecr-images.txt`
```bash
aws ecr describe-images --repository-name <ECR_REPO> \
  --query 'reverse(sort_by(imageDetails,&imagePushedAt))[:10].{tags:imageTags,pushed:imagePushedAt}' \
  --output table --region ap-south-1
```

### 3.9 CloudWatch alarms → `09-cloudwatch-alarms.txt`
```bash
aws cloudwatch describe-alarms --alarm-name-prefix cex-staging \
  --query 'MetricAlarms[].{name:AlarmName,state:StateValue,metric:MetricName}' \
  --output table --region ap-south-1
```

### 3.10 Git tag / commit → `10-git-evidence.txt`
```bash
git rev-parse HEAD && git log --oneline -n 10 && git tag --sort=-creatordate
# No tracked secrets / task-defs (expect only *.example):
git ls-files | grep -iE '\.env$|\.env\.|taskdef|overrides\.json|cex-staging-.*\.json'
```

## 4. Evidence checklist (tick before hand-off)

- [ ] `collect-evidence.ps1` run; output folder archived.
- [ ] All `/ecs/cex-staging/*` log groups show **180-day** retention (C9).
- [ ] CloudWatch alarms `cex-staging-*` exist and states captured (C10).
- [ ] ECS services running == desired; API `:56`, Admin `:54` (C-infra).
- [ ] Error-log spot check shows **no** raw PII/secrets (C1).
- [ ] DB auth/admin audit export captured for the review window (C2/C3/C5).
- [ ] INR_ONLY proven both ways: task-def env + `/auth/me` mode (C7).
- [ ] RDS backup retention + recent snapshot captured (C6 support).
- [ ] ECR image tag for the running revision captured.
- [ ] CloudFront distribution status captured (frontend).
- [ ] Git HEAD/commit recorded; no secrets tracked.
- [ ] Exported log files hashed (SHA-256) and operator/timestamp recorded.

## 5. Known limitations / production blockers

- **No SIEM** — alarms are best-effort CloudWatch proxies; true auth-anomaly
  detection and CERT-In 6-hour-ready detection are blockers
  ([`../cert-in-incident-response.md`](../cert-in-incident-response.md) gaps).
- **No IaC** — retention/alarms applied imperatively; can drift. Terraform shape
  provided in [`../cloudwatch-alarms-plan.md`](../cloudwatch-alarms-plan.md) §6.
- **No tamper-resistant log store** (S3 Object Lock) for the full 180 days yet.
- **Mock providers** throughout staging (KYC/screening/price/Razorpay/signer) —
  see [`../AUDIT_SCOPE.md`](../AUDIT_SCOPE.md) §3–§4.
- **Independent VAPT, real KYC/sanctions providers, KMS/Secrets Manager, WAF /
  private admin edge** — all open in
  [`../../compliance/production-blockers.md`](../../compliance/production-blockers.md).
- Auth-failure/lockout alarms use HTTP-status proxies; the DB trail is the
  authoritative source (§3.4).

## 6. Rollback references

- ECS rollback is **config-only** (task-def revision) — never touches matching,
  ledger, scanner, signer, or deposit logic.
  [`../SECURITY_RUNBOOK.md`](../SECURITY_RUNBOOK.md) §8–§9,
  [`../alert-runbook.md`](../alert-runbook.md) §5.
- Stage 4 itself is docs + scripts only — nothing to roll back at the app level.
  To remove Stage 4 infra changes: delete the alarms
  (`aws cloudwatch delete-alarms --alarm-names <...>`) and metric filters
  (`aws logs delete-metric-filter ...`); retention can be raised but should not
  be lowered below 180 (CERT-In).

## 7. Sign-off checklist (staging demo audit)

| Sign-off | Owner | Date | Notes |
|---|---|---|---|
| Log retention = 180d verified | _TBD_ | | C9 |
| Alarms created + states reviewed | _TBD_ | | C10 |
| Runbooks reviewed (alert + retention) | _TBD_ | | C11 |
| Evidence pack collected + archived | _TBD_ | | §4 |
| INR_ONLY confirmed (env + live) | _TBD_ | | C7 |
| No secrets/PII in logs (spot check) | _TBD_ | | C1 |
| Production blockers acknowledged | _TBD_ | | §5 |
| Accountable Security/Compliance Officer | _TBD_ | | named contact |

> Fill `_TBD_` with real names/dates out of band. This sign-off covers the
> **staging demo** audit only and does not substitute for the independent
> external VAPT this pack is preparing for.
