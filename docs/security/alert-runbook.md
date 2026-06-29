# Alert Runbook (Stage 4)

**Status: OPERATIONAL RUNBOOK — staging/demo (INR_ONLY).**
First-response guide for the CloudWatch alarms defined in
[`cloudwatch-alarms-plan.md`](./cloudwatch-alarms-plan.md). For full incident
process (severity, containment, CERT-In 6-hour reporting), follow
[`cert-in-incident-response.md`](./cert-in-incident-response.md). For repeatable
commands, see [`SECURITY_RUNBOOK.md`](./SECURITY_RUNBOOK.md).

All commands are region `ap-south-1`, cluster `cex-staging`.

---

## 0. Golden rules during any incident

- **Do NOT enable crypto.** The platform is INR_ONLY by design
  (`backend/src/modules/feature-controls/feature-controls.types.ts`,
  [`inr-only-mode.md`](../compliance/inr-only-mode.md)). No incident justifies
  flipping `canWithdrawCrypto` / `canDepositCrypto` / global crypto flags.
- **Do NOT bypass controls** — no disabling step-up auth, admin IP allowlist,
  2FA, maker-checker, or rate limits to "make it work."
- **Do NOT delete logs or audit rows.** `audit_logs`/`admin_logs`/`ledger_entries`
  are append-only by DB trigger; preserve them as evidence.
- **Do NOT touch** matching engine, ledger accounting, INR deposit/withdrawal
  business logic, or withdrawal signing as a reaction to an alert.
- Prefer **config-only** mitigations: scale, rollback task-def revision, revoke
  sessions, tighten IP allowlist, rotate a secret + redeploy.
- Record times in **UTC and IST**; the CERT-In 6-hour clock starts at detection
  for reportable incidents.

---

## 1. Alarm reference

| Alarm | Severity | Likely meaning |
|---|---|---|
| `cex-staging-api-5xx` | SEV-2/3 | API throwing server errors (bad deploy, DB/Redis dependency, unhandled bug) |
| `cex-staging-admin-5xx` | SEV-2 | Admin API errors — admin surface is sensitive |
| `cex-staging-api-error-level` | SEV-3 | Surge of error-level logs; correlate with 5xx |
| `cex-staging-admin-error-level` | SEV-2 | Admin error surge |
| `cex-staging-api-prisma-err` | SEV-2 | DB request errors (constraint/availability/migration drift) |
| `cex-staging-api-latency` | SEV-3 | Slow responses (DB load, Redis, resource starvation) |
| `cex-staging-api-404` | SEV-3/4 | 404 flood — possible route scanning / enumeration |
| `cex-staging-admin-auth-fail` | SEV-2 | Admin 401 spike — possible brute force against admin |
| `cex-staging-<svc>-running-count-low` | SEV-1/2 | An ECS service has < 1 running task — outage |
| `cex-staging-alb-unhealthy-hosts` | SEV-2 | ALB targets failing health checks |
| `cex-staging-alb-target-5xx` | SEV-2/3 | Edge-level 5xx |
| `cex-staging-alb-latency-p95` | SEV-3 | Edge latency degradation |

Severity definitions and the reporting clock: see
[`cert-in-incident-response.md`](./cert-in-incident-response.md) §3.

---

## 2. First-response steps (per alarm class)

### A. 5xx / error-level / Prisma errors (`api`/`admin`)

1. Confirm scope — recent errors with request ids:
   ```bash
   aws logs filter-log-events --log-group-name /ecs/cex-staging/api \
     --start-time $(($(date +%s)-1800))000 \
     --filter-pattern '{ $.level = "error" }' --region ap-south-1
   ```
   PowerShell tail:
   ```powershell
   aws logs tail /ecs/cex-staging/api --since 30m --filter-pattern '{ $.level = "error" }' --region ap-south-1
   ```
2. Check service health + recent deployment:
   ```bash
   aws ecs describe-services --cluster cex-staging --services cex-staging-api \
     --query 'services[].{running:runningCount,desired:desiredCount,deploy:deployments[0].rolloutState}' \
     --region ap-south-1
   ```
3. If errors started right after a deploy → **roll back the task-def revision**
   (config-only, §5). If Prisma errors → check DB connectivity/migration drift,
   do **not** hand-edit data.

### B. Latency (`api-latency`, `alb-latency-p95`)

1. Look for slow requests:
   ```bash
   aws logs filter-log-events --log-group-name /ecs/cex-staging/api \
     --start-time $(($(date +%s)-1800))000 \
     --filter-pattern '{ $.responseTime > 2000 }' --region ap-south-1
   ```
2. Check ECS CPU/memory and RDS/Redis pressure (CloudWatch metrics). Mitigate by
   scaling desired count up (config-only) — never by disabling rate limits.

### C. 404 spike (`api-404`) — possible scanning

1. Identify source IPs / paths:
   ```bash
   aws logs filter-log-events --log-group-name /ecs/cex-staging/api \
     --start-time $(($(date +%s)-1800))000 \
     --filter-pattern '{ $.res.statusCode = 404 }' --region ap-south-1
   ```
2. Usually SEV-4 (noise). If targeted/sustained at sensitive paths → treat as
   recon (SEV-3), note indicators, and block at WAF/upstream when provisioned.
   The global rate limiter already throttles abusive clients.

### D. Admin auth-failure spike (`admin-auth-fail`)

1. Pull the **authoritative** admin auth trail from the DB (not just CloudWatch):
   ```sql
   SELECT action, actor_id, ip, created_at
   FROM admin_logs
   WHERE action IN ('auth.login_failed','auth.login_locked')
     AND created_at > now() - interval '1 hour'
   ORDER BY created_at DESC;
   ```
2. Confirm the admin lockout counters are doing their job (Redis brute-force
   lockout, `admin-rbac.service.ts`). Contain per §3.

### E. ECS running-count low / ALB unhealthy (outage)

1. Why are tasks down?
   ```bash
   aws ecs describe-services --cluster cex-staging --services cex-staging-api --region ap-south-1
   aws ecs list-tasks --cluster cex-staging --service-name cex-staging-api --desired-status STOPPED --region ap-south-1
   ```
   Inspect a stopped task's `stoppedReason` and its log stream for the crash.
2. If a bad image/config → **roll back** (§5). If capacity → raise desired count.

---

## 3. Containment (when an alert is a real incident)

- **Revoke sessions:** user sessions honor Redis `session:revoked:<sessionId>`
  instantly; admin → suspend admin (`revokeAllAdminSessions`).
- **Lock/disable** the affected account(s); rotate exposed secrets in Secrets
  Manager and `update-service --force-new-deployment` to pick them up.
- **Tighten admin IP allowlist** / block offending ranges at WAF/upstream.
- If platform-level: the global **withdrawal freeze kill-switch** and feature
  controls can move the platform to a safe state. (Crypto is *already* globally
  disabled — leave it that way.)
- **Preserve** evidence before remediation (RDS snapshot, export log range +
  record SHA-256).

Full process: [`cert-in-incident-response.md`](./cert-in-incident-response.md) §4–§5.

---

## 4. Inspect logs — quick reference

```bash
# Follow a service:
aws logs tail /ecs/cex-staging/api   --follow --region ap-south-1
aws logs tail /ecs/cex-staging/admin --follow --region ap-south-1

# Trace one request across the flow (every log carries requestId):
aws logs filter-log-events --log-group-name /ecs/cex-staging/api \
  --filter-pattern '{ $.reqId = "<REQUEST_ID>" }' --region ap-south-1
```

> Spot-check that logs contain **no** raw PAN/Aadhaar/tokens/secrets (redaction
> is at `backend/src/lib/logger.ts`). If any leak, escalate immediately.

## 5. Rollback (config-only) — reference

```bash
# Last-known-good revisions for this stage: api:56, admin:54.
aws ecs list-task-definitions --family-prefix cex-staging-api --sort DESC --region ap-south-1
aws ecs update-service --cluster cex-staging --service cex-staging-api \
  --task-definition cex-staging-api:<lastGoodRevision> --force-new-deployment --region ap-south-1
```

Rollback changes only the task-def revision. It does **not** change matching,
ledger, scanner, signer, or deposit logic. See
[`SECURITY_RUNBOOK.md`](./SECURITY_RUNBOOK.md) §8–§9.

## 6. Escalation

- SEV-1/2: notify the accountable Compliance/Security Officer + engineering lead
  immediately (contact checklist in
  [`cert-in-incident-response.md`](./cert-in-incident-response.md) §8 — kept out
  of band, not in Git).
- Reportable incident → CERT-In within **6 hours of detection**
  (`incident@cert-in.org.in` / CERT-In reporting form).
- Open one incident channel as the single source of truth; keep a UTC+IST
  timeline.

## 7. After the incident

- Blameless post-incident review within 5 business days; root cause, timeline,
  corrective actions with owners.
- Update this runbook and `SECURITY_HARDENING_REPORT.md`; feed blockers into
  [`production-blockers.md`](../compliance/production-blockers.md).
- Preserve retest evidence; link it from the
  [evidence pack](./evidence-pack/README.md).
