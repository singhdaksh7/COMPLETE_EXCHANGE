# EXORA — Cloud Security Checklist (AWS)

**Stage:** 7.0B/7.0C
**Environment:** AWS `ap-south-1`, ECS Fargate (separate API / admin / worker /
scanner services), RDS PostgreSQL, ElastiCache Redis, CloudFront + Amplify
(static frontend), Secrets Manager, CloudWatch Logs.
**Last updated:** 2026-06-23

Legend: ✅ verified in code/config · ☐ to confirm with cloud account owner ·
⚠️ recommendation / not yet implemented.

> This checklist is reviewed from the **application repository** plus the
> sanitized task-definition template. Items marked ☐ require console/CLI
> confirmation by whoever holds the AWS account — they cannot be proven from the
> repo alone.

---

## 1. Secrets management
- ✅ ECS task secrets are injected via **Secrets Manager** (`secrets[].valueFrom` ARNs), not plaintext env. See `backend/deploy/taskdef.example.json`.
- ✅ No DB/JWT/KYC secrets appear as plaintext in any task definition `environment[]` block.
- ✅ App reads secrets from env at boot via strict validation (`src/config/env.ts`); it never logs them (pino `redact` list).
- ☐ Confirm Secrets Manager rotation is configured (or documented as manual) for `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `KYC_ENCRYPTION_KEY`, `KYC_WEBHOOK_SECRET`, `REDIS_URL`.
- ⚠️ Live task definitions are **git-ignored** as of Stage 7.0B (they contained the AWS account id + secret ARNs). Pull them locally with `aws ecs describe-task-definition`; never commit.

## 2. Database (RDS PostgreSQL)
- ☐ **RDS public accessibility = disabled** (private subnets only).
- ☐ RDS reachable only from the ECS task security group (no `0.0.0.0/0`).
- ☐ Encryption at rest enabled (KMS).
- ☐ TLS enforced for DB connections (`sslmode=require` in `DATABASE_URL`).
- ☐ Automated backups enabled; retention ≥ 7 days (see §10).

## 3. Cache (ElastiCache Redis)
- ☐ **Redis public accessibility = disabled**; private subnet only.
- ☐ Redis security group allows only the ECS task SG.
- ☐ AUTH token / in-transit encryption enabled where supported.

## 4. Network / security groups
- ☐ ECS tasks run in private subnets behind ALB; outbound via NAT.
- ☐ ALB listener is HTTPS (443) with a valid ACM cert; HTTP redirects to HTTPS.
- ☐ Admin ALB / admin service is **not** publicly reachable — restricted by security group + the app-level per-admin **IP allowlist** (`src/middleware/admin-authenticate.ts`, enforced on every request).
- ☐ No security group exposes the DB/Redis/admin ports to `0.0.0.0/0`.

## 5. S3
- ☐ KYC document / evidence buckets have **Block Public Access = ON** (all four settings).
- ☐ Buckets are encrypted (SSE-S3 or SSE-KMS).
- ☐ Access is via presigned URLs with short TTL (`KYC_UPLOAD_URL_TTL_SEC`) and IAM, never public-read.
- ☐ Bucket policies grant access only to the task role(s) that need it.

## 6. CloudFront / frontend
- ✅ Frontend is a **static export** (no Next.js server, no Image Optimizer at runtime).
- ☐ CloudFront enforces **HTTPS** (Viewer Protocol Policy = redirect-to-https), TLS 1.2+.
- ☐ Origin access restricted (OAC/OAI) so the S3/Amplify origin is not directly public.
- ☐ CORS on the API restricted to the CloudFront domain + admin domain (`CORS_ORIGINS`) — verified in `src/middleware/security.ts`.

## 7. Logging & monitoring
- ✅ App logs are structured JSON (pino) with a secret-redaction list; shipped to CloudWatch (`awslogs` driver).
- ☐ **CloudWatch Logs retention** set explicitly per log group (recommend ≥ 90 days for audit; do not leave "Never expire" only if cost-managed, but ensure it is *intentional*).
- ⚠️ Enable **ALB access logs** and **CloudFront access logs** to S3 (recommended; supports incident forensics).
- ⚠️ Enable **CloudTrail** (management events) for the account and **GuardDuty** (recommended).
- ☐ Alarms on 5xx rate, ECS task restarts, RDS CPU/connections, Redis evictions.

## 8. WAF
- ⚠️ **AWS WAF recommended** in front of CloudFront and/or the ALB:
  - AWS managed core rule set + known-bad-inputs.
  - Rate-based rule (complements the app's Redis rate limiter).
  - Geo / IP allow rules for the admin surface.

## 9. IAM least privilege
- ☐ Distinct **task role** (app runtime) and **execution role** (image pull + secret fetch) per service — confirmed in template.
- ☐ Task role grants only the specific Secrets Manager ARNs + specific S3 prefixes it uses; no `secretsmanager:*` or `s3:*` wildcards.
- ☐ No long-lived IAM **user** access keys used by the app (use task roles). The Stage 7.0B scan found the deploy artifacts were registered by an IAM user named `Devloper`; confirm that user is for deploys only and has scoped permissions + MFA.
- ☐ Human console access uses SSO/MFA; root account locked down.

## 10. Backups & restore
- ☐ RDS automated backups + a tested **point-in-time restore** runbook.
- ☐ Periodic manual snapshot before each migration/deploy.
- ☐ Restore drill performed and documented (RPO/RTO recorded).
- ☐ Secrets Manager values backed up / re-creatable from a secure source.

## 11. Incident response
- ☐ Documented on-call / escalation contacts (see AUDITOR_TEST_ACCOUNTS_TEMPLATE.md placeholder + SECURITY_RUNBOOK.md).
- ☐ Process: detect → contain (rotate secrets, revoke sessions, scale down) → eradicate → recover → post-mortem.
- ✅ App supports **instant session revocation** (Redis `session:revoked:*`) and per-admin IP allowlist for fast containment.

## 12. Staging vs production separation
- ☐ Separate AWS account **or** strictly separate VPC/resources/IAM per environment.
- ☐ Separate Secrets Manager paths (`cex/staging/*` vs `cex/prod/*`).
- ⚠️ All `ALLOW_MOCK_*` / `ALLOW_*` relaxation flags MUST be false/removed in production (see AUDIT_SCOPE.md §3). The app's prod-safety guard (`src/lib/prod-safety.ts`) refuses to boot in `NODE_ENV=production` if mock providers are enabled without explicit acknowledgement.
- ☐ Production uses real providers (KYC, screening, payment, signer/HSM) — none of which are integrated yet (production blocker).
