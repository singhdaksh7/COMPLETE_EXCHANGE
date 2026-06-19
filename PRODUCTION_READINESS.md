# Production Readiness Report

Status: staging/demo ready, not real-money production ready.

## Production-Ready Foundations

- Public API and admin API are separated into distinct Express apps and process entrypoints.
- Versioned API prefixes are in place: `/api/v1` and `/admin/v1`.
- Health endpoints are available at root and versioned prefixes.
- Readiness checks validate PostgreSQL and Redis connectivity without exposing URLs or secrets.
- Prisma-backed ledger architecture keeps money movement behind double-entry postings.
- Admin RBAC exists with seeded baseline permissions and role checks.
- Manual INR maker-checker flow exists for large deposits.
- User risk controls exist for account freeze, withdrawal block, risk level, and risk notes.
- Structured JSON logging is configured with request correlation and secret redaction.
- Startup environment validation fails fast for missing critical vars and production placeholder secrets.

## Staging / Demo-Only Today

- SES is not enabled unless `MAIL_PROVIDER=ses` and AWS region are configured.
- Google OAuth is disabled unless explicitly configured.
- Razorpay live INR gateway is not enabled.
- Withdrawal signing is mock-only; live signing intentionally refuses to run.
- Crypto deposit proof object storage is deferred.
- Demo/sandbox markets and labels are acceptable for staging but not final customer-facing production.
- Staging bootstrap admin may have TOTP disabled for operational access; production admins must enforce TOTP.

## Required Before Real-Money Production

- Enable production mail delivery and bounce/complaint monitoring through SES or an equivalent provider.
- Enable production-grade admin TOTP for every admin account; remove any bootstrap bypasses.
- Replace HS256 JWT secrets with managed rotation or migrate to asymmetric signing.
- Wire a real KYC vendor and document provider SLAs, webhook retry policy, and manual review escalation.
- Wire a real INR gateway or bank reconciliation workflow with production settlement reporting.
- Implement production object storage for crypto deposit proof uploads and retention.
- Implement live withdrawal signing with KMS/HSM custody controls, dual approval, withdrawal velocity limits, and incident pause procedures.
- Validate legal/compliance requirements for India operations, FIU/KYC/AML obligations, tax reporting, and customer disclosures.
- Complete load, failover, and backup/restore drills.

## Security Checklist

- `DATABASE_URL`, `REDIS_URL`, JWT secrets, KYC secrets, Razorpay secrets, OAuth secrets, and AWS credentials are never logged.
- `CORS_ORIGINS` is explicit in production.
- Admin API is network-restricted by VPN/IP allowlist and still protected by admin auth/RBAC.
- Admin actions create `AdminLog` / audit entries.
- Production JWT/KYC/Razorpay secrets are high-entropy and not dev placeholders.
- Error responses are clean envelopes; internal details remain in server logs.
- Passwords, refresh tokens, OTP/TOTP values, private keys, API keys, and authorization headers are redacted.
- Rate limits and login lockout are enabled.

## Infra Checklist

- ECS services: `cex-staging-api`, `cex-staging-admin`, `cex-staging-scanner`.
- Admin task command must be `node dist/admin-server.js`.
- API task command must be `node dist/server.js`.
- Scanner task command must be `node dist/scanner.js`.
- Database migrations run with `npx prisma migrate deploy` before traffic is shifted.
- RBAC baseline script is run with `ALLOW_STAGING_RBAC_SEED=YES`.
- CloudFront invalidation is issued after frontend deploys.
- Rollback plan identifies previous ECS task definitions and CloudFront artifact.

## Environment Variables

Required in staging/production:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGINS`
- `FRONTEND_URL`
- `KYC_ENCRYPTION_KEY`
- `KYC_WEBHOOK_SECRET`

Required only when feature is enabled:

- `AWS_REGION` when `MAIL_PROVIDER=ses`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` when `GOOGLE_OAUTH_ENABLED=true`
- `TRONGRID_API_KEY` when `TRON_PROVIDER=live`
- `BSC_TESTNET_RPC_URL` when `BSC_PROVIDER=live`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` when `RAZORPAY_PROVIDER=live`

Safe optional/defaulted knobs:

- `PORT`, `ADMIN_PORT`, `API_PREFIX`, `ADMIN_API_PREFIX`
- `LOG_LEVEL`, `LOG_PRETTY`
- rate-limit and login-lockout settings
- scanner polling/reorg/safety-lag settings
- explorer URL bases
- conversion mock pricing settings

## Monitoring Checklist

- Health:
  - `/health`
  - `/api/v1/health`
  - `/admin/v1/health`
  - `/ready`
  - `/admin/v1/ready`
- CloudWatch log groups:
  - `/ecs/cex-staging/api`
  - `/ecs/cex-staging/admin`
  - `/ecs/cex-staging/scanner`
- Alerts to add before production:
  - API/admin 5xx rate
  - Readiness failures
  - Postgres connection saturation
  - Redis unavailability
  - Failed ECS tasks
  - Admin login failures / suspicious IPs
  - Withdrawal queue stalls
  - Scanner lag
  - Ledger invariant/reconciliation failures

## Useful CloudWatch Queries

Recent errors:

```powershell
aws logs filter-log-events --log-group-name "/ecs/cex-staging/api" --filter-pattern "ERROR" --limit 25
aws logs filter-log-events --log-group-name "/ecs/cex-staging/admin" --filter-pattern "ERROR" --limit 25
aws logs filter-log-events --log-group-name "/ecs/cex-staging/scanner" --filter-pattern "ERROR" --limit 25
```

Recent admin actions:

```powershell
aws logs filter-log-events --log-group-name "/ecs/cex-staging/admin" --filter-pattern "admin.user" --limit 25
```

Failed task investigation:

```powershell
aws ecs list-tasks --cluster cex-staging --desired-status STOPPED --max-results 10
aws ecs describe-tasks --cluster cex-staging --tasks <task-arn>
aws ecs describe-services --cluster cex-staging --services cex-staging-api cex-staging-admin cex-staging-scanner --query "services[].events[0:10]"
```

## Backup / Restore Checklist

- Define RPO/RTO targets for PostgreSQL and Redis.
- Enable automated PostgreSQL backups and point-in-time recovery.
- Test restore into an isolated staging database.
- Verify Prisma migrations against restored snapshots.
- Export and retain audit/admin logs according to compliance policy.
- Document key rotation impact on encrypted KYC data before rotating KYC encryption secrets.

## Compliance / KYC Notes

- KYC status and provider check fields are present, but the vendor integration remains staging/demo unless configured.
- PAN/Aadhaar references are encrypted in the database.
- Manual review and admin audit trails exist.
- Before production, confirm retention, deletion, data residency, AML monitoring, suspicious activity reporting, and tax/TDS workflows with counsel/compliance.

## Known Limitations / Deferred Items

- SES not enabled by default.
- Google OAuth not enabled by default.
- TOTP may be disabled for staging bootstrap admin; production must require it.
- Razorpay/automated INR gateway not enabled.
- Crypto deposit proof object storage deferred.
- Withdrawal signer remains mock-only.
- Scanner has mock/live provider split; BSC live RPC is read-only scanner infrastructure and should be monitored for lag/failure.
- Scanner test/mock failures should remain tracked if present in future full-suite runs.
- Sandbox market labels and demo liquidity are staging-only.
- Frontend static export requires query-string detail pages for unknown dynamic admin user IDs.
