# 180-Day Log Retention Readiness (CERT-In)

**Status: READINESS / DOCUMENTED — not yet enforced in infrastructure.**
**Mode: INR_ONLY staging/demo. Do not treat as a completed compliance control.**

CERT-In Directions (April 2022), Direction (iv), require enabled logs to be
maintained securely for a **rolling 180 days** within Indian jurisdiction. This
document records the current state and the exact steps to enforce it.

---

## 1. Current state (verified in code)

- The backend emits **structured JSON logs** via pino (`backend/src/lib/logger.ts`),
  with redaction of passwords, tokens, OTP/TOTP secrets, private keys, and PII
  (`redactPaths`, `backend/src/lib/logger.ts:13-61`).
- Append-only application audit trails exist in the database:
  `audit_logs` and `admin_logs` (DB triggers reject UPDATE/DELETE — see
  `backend/prisma/migrations/.../migration.sql`).
- A **retention policy registry** exists in the compliance module
  (`backend/src/modules/compliance/retention.service.ts`) with an `AUDIT_LOG`
  baseline of 8 years (review-only; it never deletes records).
- **There is no Infrastructure-as-Code (Terraform/CDK/CloudFormation) in the
  repository.** CloudWatch log group retention is therefore **not currently
  managed in code** and must be set/verified in the AWS account directly.

> Because retention is not codified, this is a **readiness** item, not an
> implemented control. The steps below make it real.

---

## 2. Verify current CloudWatch retention (AWS CLI)

```bash
# List all log groups and their retention (in days; blank = "Never expire").
aws logs describe-log-groups \
  --query 'logGroups[].{name:logGroupName,retentionDays:retentionInDays}' \
  --output table --region ap-south-1
```

Any group showing a blank/`null` `retentionDays`, or a value `< 180`, is
non-compliant for ICT logs.

## 3. Set 180-day retention (AWS CLI)

```bash
# Apply to a single group:
aws logs put-retention-policy \
  --log-group-name "/ecs/exora-backend" \
  --retention-in-days 180 \
  --region ap-south-1

# Apply to ALL groups (review the list first):
for lg in $(aws logs describe-log-groups \
      --query 'logGroups[].logGroupName' --output text --region ap-south-1); do
  aws logs put-retention-policy --log-group-name "$lg" \
    --retention-in-days 180 --region ap-south-1
done
```

> CloudWatch only allows discrete values; **180 is an accepted value**.

## 4. Set retention (AWS Console)

1. CloudWatch → **Log groups**.
2. Select each log group used by EXORA (ECS task logs, ALB, RDS, etc.).
3. **Actions → Edit retention setting**.
4. Choose **180 days** → **Save**.

## 5. Recommended future hardening (not done here)

- Codify retention in IaC (Terraform `aws_cloudwatch_log_group.retention_in_days = 180`)
  so it cannot drift. Tracked in `docs/compliance/production-blockers.md`.
- Ship logs to a centralized, tamper-resistant store (e.g. CloudWatch → S3 with
  Object Lock, or a SIEM) for the full 180 days with access logging.
- Enable **NTP/time-sync** on all hosts (CERT-In Direction (iii)) so timestamps
  are consistent across evidence — currently relies on the platform clock.

## 6. Evidence to capture for the audit

- Screenshot/CLI output of `describe-log-groups` showing `retentionDays = 180`.
- Date of application and the operator who applied it.
- A note of the log groups in scope (ICT systems serving EXORA).

---

**Do not claim CERT-In log-retention compliance until:** retention is set to 180
days on every in-scope log group, time-sync is enabled, and centralized
retention with access control is in place.
