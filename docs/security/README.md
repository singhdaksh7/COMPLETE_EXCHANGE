# EXORA — Security & Audit/VAPT Handover Pack

Stage 7.0B/7.0C deliverables. Start with `AUDIT_SCOPE.md`, then the report.

| Document | Purpose |
|----------|---------|
| [AUDIT_SCOPE.md](./AUDIT_SCOPE.md) | Authoritative in/out-of-scope, staging assumptions, known mocks. |
| [SECURITY_HARDENING_REPORT.md](./SECURITY_HARDENING_REPORT.md) | What was reviewed/fixed/tested, dependency audit, unresolved risks, production blockers. |
| [CLOUD_SECURITY_CHECKLIST.md](./CLOUD_SECURITY_CHECKLIST.md) | AWS posture checklist (Secrets Manager, RDS/Redis/S3, CloudFront, WAF, IAM, backups, IR). |
| [VAPT_HANDOVER_CHECKLIST.md](./VAPT_HANDOVER_CHECKLIST.md) | Targets, accounts, roles, high-risk flows, out-of-scope, contacts, report expectations. |
| [AUDITOR_TEST_ACCOUNTS_TEMPLATE.md](./AUDITOR_TEST_ACCOUNTS_TEMPLATE.md) | Template for auditor accounts — **no real credentials in Git**. |
| [SECURITY_RUNBOOK.md](./SECURITY_RUNBOOK.md) | Repeatable commands: tests, build, audits, secret scan, logs, deploy/rollback, IR. |

### Stage 4 — observability & audit evidence

| Document | Purpose |
|----------|---------|
| [evidence-pack/README.md](./evidence-pack/README.md) | Structured staging audit evidence pack: controls, how-to-verify, evidence commands, checklist, sign-off. |
| [log-retention-runbook.md](./log-retention-runbook.md) | CloudWatch 180-day retention: verify, update safely, export for auditor. |
| [cloudwatch-alarms-plan.md](./cloudwatch-alarms-plan.md) | Metric filters + alarms (5xx, DB errors, auth-fail, ECS/ALB health, latency, 404) + Terraform-ready reference. |
| [alert-runbook.md](./alert-runbook.md) | Per-alarm first response, containment, rollback, escalation; "do not enable crypto / bypass controls". |

> Stage 4 ships **scripts + docs only** (`scripts/observability/`); no app/runtime
> change, no DB migration, no deploy. See [log-retention-180-days.md](./log-retention-180-days.md)
> for the CERT-In framing the retention runbook implements.

### Stage 5 — Secrets Manager / KMS / IAM production readiness

| Document | Purpose |
|----------|---------|
| [secret-inventory.md](./secret-inventory.md) | Catalogue of every secret category (no values): owner, env var, storage, rotation, plaintext/SM/KMS requirements, blast radius. Crypto private keys prohibited in app env. |
| [kms-readiness.md](./kms-readiness.md) | Production CMK plan, alias naming, rotation, staging/prod separation, IAM decrypt boundaries, CloudTrail audit commands, key-deletion + compromise process. |
| [iam-least-privilege-readiness.md](./iam-least-privilege-readiness.md) | Read-only commands to inspect ECS task/execution roles + policies; production blockers to flag; least-privilege plan (no auto-changes). |
| [secrets-rotation-runbook.md](./secrets-rotation-runbook.md) | Per-secret rotation steps, session-invalidation impact, admin-lockout prevention, emergency rotation, rollback, evidence. |
| `scripts/security/collect-secrets-evidence.ps1` | Read-only secrets-posture evidence: Secrets Manager metadata + ECS env/secret NAMES only. Never reads values; never calls `get-secret-value`. |
| [../compliance/production-blockers.md](../compliance/production-blockers.md) | Single source of truth for production blockers (KMS, rotation, IAM, RDS retention, crypto readiness). |

> Stage 5 adds **one** defensive backend guard: real production refuses to boot
> with any `CRYPTO_*_GLOBAL_ENABLED=true` unless `CRYPTO_PRODUCTION_READINESS_ACK=true`
> (`backend/src/lib/prod-safety.ts`). Staging (`APP_ENV=staging`) is unaffected and
> keeps crypto OFF. Everything else is docs + a read-only script.

### Stage 6 — admin edge security / WAF audit readiness

| Document | Purpose |
|----------|---------|
| [admin-edge-security-readiness.md](./admin-edge-security-readiness.md) | Admin/user surface inventory, implemented controls, observed edge topology (root→Vercel www vs CloudFront/S3), exposure, evidence checks, future hardening. |
| [waf-readiness-plan.md](./waf-readiness-plan.md) | Staging-safe AWS WAF plan for CloudFront: managed rule groups, rate-based rules, admin protections, monitor-first, rollback, cost/scoping caveats. |
| [cloudfront-security-headers-readiness.md](./cloudfront-security-headers-readiness.md) | Current header state (captured) + recommended headers + staged CSP (report-only first) + cache-control. |
| [admin-access-runbook.md](./admin-access-runbook.md) | Who gets admin access, MFA, break-glass, lockout, IP allowlist/VPN, session/RBAC/audit review, offboarding, compromise response. |
| [admin-endpoint-safe-checks.md](./admin-endpoint-safe-checks.md) | Non-destructive auditor checks: unauth→401/403, rate-limit, RBAC, user-token rejection, audit logging, 2FA. |
| `scripts/security/plan-waf-readiness.ps1` | WAF plan (dry-run default; `-Apply`+`-ConfirmCreate` to create in COUNT mode; never auto-associates to CloudFront). |
| `scripts/security/collect-edge-security-evidence.ps1` | Read-only edge evidence: CloudFront status/aliases/cert/WAF, DNS, response headers, ECS refs, alarms; PASS/WARN/FAIL summary. |

> Stage 6 is **docs + dry-run/read-only scripts only** — no WAF created, no AWS
> resource modified, no backend change, crypto stays OFF. Key finding: the live
> `www.exorain.com` frontend is on **Vercel**, separate from CloudFront
> `E36DO8GL4SA61N` (S3) — see the edge readiness doc.

> These documents describe an internal hardening pass. They are **not** a legal,
> FIU/PMLA, or penetration-test certification. They prepare EXORA for an
> independent external VAPT. Fill every `<placeholder>` out of band.
