# IAM Least-Privilege Readiness (Stage 5)

**Status: READINESS PLAN + READ-ONLY EVIDENCE — staging/demo (INR_ONLY).**
This document provides read-only commands to inspect the IAM posture of the ECS
roles and a least-privilege plan. It **does not modify any IAM policy** — an
IAM least-privilege review is a production blocker
(`docs/compliance/production-blockers.md`).

Region `ap-south-1` · cluster `cex-staging` · services `cex-staging-api`,
`cex-staging-admin`. **Verify live task defs first** (revisions drift):

```bash
aws ecs describe-services --cluster cex-staging \
  --services cex-staging-api cex-staging-admin \
  --query 'services[].{name:serviceName,taskDef:taskDefinition}' --output table --region ap-south-1
```

---

## 1. Find the task & execution roles

```bash
# For each service's live task def, read both roles:
for SVC in cex-staging-api cex-staging-admin; do
  TD=$(aws ecs describe-services --cluster cex-staging --services $SVC \
        --query 'services[0].taskDefinition' --output text --region ap-south-1)
  echo "== $SVC ($TD) =="
  aws ecs describe-task-definition --task-definition "$TD" --region ap-south-1 \
    --query 'taskDefinition.{taskRole:taskRoleArn,execRole:executionRoleArn}' --output table
done
```

- **Task role** — the identity the running app assumes (Secrets Manager / KMS /
  S3 / SES access lives here).
- **Execution role** — used by the ECS agent to pull the image and inject
  secrets at task start (ECR + Secrets Manager/KMS for injection).

## 2. Inspect a role's policies (read-only)

Replace `<ROLE>` with the role name (last path segment of the ARN).

```bash
# Attached managed policies:
aws iam list-attached-role-policies --role-name <ROLE> \
  --query 'AttachedPolicies[].{name:PolicyName,arn:PolicyArn}' --output table
# Inline policies (names, then each document):
aws iam list-role-policies --role-name <ROLE> --output table
aws iam get-role-policy --role-name <ROLE> --policy-name <INLINE_NAME> --output json
# A managed policy's current document:
POLv=$(aws iam get-policy --policy-arn <POLICY_ARN> --query 'Policy.DefaultVersionId' --output text)
aws iam get-policy-version --policy-arn <POLICY_ARN> --version-id "$POLv" \
  --query 'PolicyVersion.Document' --output json
```

## 3. What each role SHOULD be scoped to

| Capability | Who needs it | Least-privilege target |
|---|---|---|
| `secretsmanager:GetSecretValue` | task role (api/admin) | Only the **specific secret ARNs** that service uses — never `*` |
| `kms:Decrypt`, `kms:DescribeKey` | task + exec role | Only `alias/exora/prod/secrets` CMK ARN; add `kms:ViaService` = `secretsmanager.ap-south-1.amazonaws.com` |
| `logs:CreateLogStream`, `logs:PutLogEvents` | task/exec role | Only this service's `/ecs/cex-staging/*` log group ARN |
| `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`, `ecr:GetAuthorizationToken` | execution role | Pull from the specific ECR repo; `GetAuthorizationToken` is account-wide by design |
| `ses:SendEmail` / `ses:SendRawEmail` | task role (api) | Scoped to the verified SES identity ARN; condition on `ses:FromAddress` |
| `s3:PutObject` / `s3:GetObject` | deploy/CI or task role (if used) | Only the frontend/deploy bucket ARN + `/*`; no `s3:*` |

## 4. Production blockers to FLAG (inspect for these)

Mark any of the following as a blocker in `docs/compliance/production-blockers.md`:

- **`secretsmanager:*`** or `Resource: "*"` on GetSecretValue → over-broad; scope
  to exact secret ARNs.
- **`kms:Decrypt` on `Resource: "*"`** → scope to the secrets CMK ARN + add a
  `kms:ViaService` condition.
- **Admin-level / `*:*` policies** (e.g. `AdministratorAccess`, `PowerUserAccess`,
  `AmazonS3FullAccess`) attached to a task/execution role → remove.
- **Task role access to unrelated secrets** (a service can read secrets it never
  uses) → split secrets per service and scope ARNs.
- **Same role shared between API and Admin** without justification → the admin
  surface is more sensitive; prefer separate roles so admin secrets aren't
  readable by the user API and vice-versa. If shared, document why.
- **Missing condition constraints** on secrets/KMS (no `kms:ViaService`, no
  resource scoping) where they could apply.
- **Wildcard `logs:*` / `ecr:*` / `ses:*`** → scope to the specific resources.
- **`iam:*`, `sts:AssumeRole *`, or pass-role wildcards** on a task role → none
  of the app roles should administer IAM.

Quick scan for wildcards in inline policies of a role:

```bash
aws iam list-role-policies --role-name <ROLE> --query 'PolicyNames' --output text \
  | tr '\t' '\n' | while read P; do
      echo "== $P =="
      aws iam get-role-policy --role-name <ROLE> --policy-name "$P" \
        --query 'PolicyDocument.Statement[?Resource==`*` || contains(to_string(Action), `*`)]' --output json
    done
```

## 5. Least-privilege plan (do NOT auto-apply)

1. Inventory exactly which secrets each service reads (from the inventory + task
   def `secrets[]`).
2. Author **per-service** scoped policies: GetSecretValue on that service's
   secret ARNs only; KMS Decrypt on the one CMK with `kms:ViaService`.
3. Separate API vs Admin task roles (or justify sharing in writing).
4. Remove any managed admin/full-access policy from task/execution roles.
5. Add resource scoping + conditions; re-test in staging first.
6. Codify in IaC so the boundary cannot drift (blocker: no IaC in repo yet).

> **No IAM change is made by this work.** This is a plan + evidence commands.
> Capture findings into the evidence pack and the production-blockers checklist.
