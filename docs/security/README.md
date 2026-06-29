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

> These documents describe an internal hardening pass. They are **not** a legal,
> FIU/PMLA, or penetration-test certification. They prepare EXORA for an
> independent external VAPT. Fill every `<placeholder>` out of band.
