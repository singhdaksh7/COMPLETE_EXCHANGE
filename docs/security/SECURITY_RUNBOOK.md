# EXORA — Security Runbook

**Stage:** 7.0B/7.0C · **Last updated:** 2026-06-23

Operational, repeatable commands for verification, dependency/secret scanning,
log review, safe deployment, rollback, and incident response. Run from the repo
root unless noted. Windows shells: use PowerShell **or** Git Bash; commands
below are POSIX-style (Git Bash) — they work in PowerShell too unless noted.

---

## 1. Backend tests
```bash
cd backend
npm ci
npm test                       # vitest run (unit + integration)
npx vitest run test/unit       # unit only (no DB/Redis needed)
```
> Integration tests need PostgreSQL + Redis (see `docker-compose.yml` /
> `.github/workflows/ci.yml`). Unit tests are pure and run anywhere.

## 2. Backend typecheck / lint
```bash
cd backend
npm run typecheck              # tsc --noEmit
npm run lint                   # eslint "src/**/*.ts"
```

## 3. Frontend build
```bash
cd frontend
npm ci
npm run build                  # next build (static export to ./out)
```

## 4. Mobile checks (only if mobile is touched)
```bash
cd mobile
npm ci
npm run typecheck              # tsc --noEmit
npm run lint                   # expo lint
npx expo-doctor                # config / dependency health
```

## 5. Dependency audit (all packages)
```bash
# Runtime (production) only — what actually ships:
( cd backend  && npm audit --omit=dev )
( cd frontend && npm audit --omit=dev )
( cd mobile   && npm audit )

# Full (incl. dev tooling):
( cd backend  && npm audit )
( cd frontend && npm audit )

# Apply SAFE, non-breaking fixes only (never --force without review):
npm audit fix
```
> Avoid `npm audit fix --force` — it pulls breaking majors. Within-major
> patch/minor bumps (e.g. `npm install next@14.2.35 --save-exact`) are preferred.

## 6. Secret scan
```bash
# Live AWS access keys / private keys / mnemonics in tracked files:
git grep -nE 'AKIA[0-9A-Z]{16}'                       $(git rev-parse HEAD)
git grep -nE 'BEGIN (RSA|EC|OPENSSH|PGP|PRIVATE)'      $(git rev-parse HEAD)

# Infra identifiers (account id / ARNs) leaking into tracked files:
git grep -lE '[0-9]{12}'                               # 12-digit AWS account ids
git grep -lE 'arn:aws:'                                # any AWS ARN

# Confirm no .env / deploy artifacts are tracked:
git ls-files | grep -iE '\.env$|\.env\.|taskdef|overrides\.json|cex-staging-.*\.json'
# (only *.example files should appear)
```
Optional deeper scan (if available): `gitleaks detect --no-banner` or
`trufflehog filesystem .`.

## 7. Review logs
- App logs are structured JSON (pino) shipped to **CloudWatch Logs**
  (`/ecs/cex-<env>/{api,admin,worker,scanner}`). Secrets/PII are redacted at the
  logger (`src/lib/logger.ts`).
```bash
# Tail a log group (requires AWS CLI + permissions):
aws logs tail /ecs/cex-staging/api   --follow --region ap-south-1
aws logs tail /ecs/cex-staging/admin --follow --region ap-south-1

# Search for errors / a request id:
aws logs filter-log-events --log-group-name /ecs/cex-staging/api \
  --filter-pattern '"level":"error"' --region ap-south-1
```
> Every request carries a `requestId`; pivot on it to trace a flow. Verify spot
> checks show NO raw PAN/Aadhaar/tokens/secrets — escalate immediately if found.

## 8. Deploy staging safely
1. Branch, PR, CI green (tests + typecheck + build).
2. Build & push image to ECR (`<acct>.dkr.ecr.ap-south-1.amazonaws.com/cex-staging-backend:<tag>`).
3. Register a new task definition from the **local** (git-ignored) task-def JSON
   — never commit it. Template: `backend/deploy/taskdef.example.json`.
   ```bash
   aws ecs describe-task-definition --task-definition cex-staging-api \
     --query taskDefinition --region ap-south-1 > taskdef.local.json   # git-ignored
   # edit image tag, then:
   aws ecs register-task-definition --cli-input-json file://taskdef.local.json --region ap-south-1
   ```
4. Update the service to the new revision:
   ```bash
   aws ecs update-service --cluster cex-staging --service cex-staging-api \
     --task-definition cex-staging-api:<newRevision> --region ap-south-1
   ```
5. Watch deployment + health:
   ```bash
   aws ecs describe-services --cluster cex-staging --services cex-staging-api --region ap-south-1
   curl -fsS <https://staging-api-url>/health
   ```

## 9. Rollback an ECS service
```bash
# List recent task-def revisions:
aws ecs list-task-definitions --family-prefix cex-staging-api --sort DESC --region ap-south-1
# Point the service back at the last-known-good revision:
aws ecs update-service --cluster cex-staging --service cex-staging-api \
  --task-definition cex-staging-api:<lastGoodRevision> --force-new-deployment --region ap-south-1
```
> Rollback is config-only (task-def revision). It does NOT change matching,
> ledger, scanner, signer, or deposit logic.

## 10. Invalidate CloudFront (frontend deploy)
```bash
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> \
  --paths "/*" --region ap-south-1
```

## 11. Incident response — first steps
1. **Triage:** confirm scope via CloudWatch logs + alarms; identify affected accounts/sessions.
2. **Contain:**
   - Revoke sessions — the app honors Redis `session:revoked:<sessionId>` instantly.
   - Tighten admin IP allowlists; disable compromised admin accounts.
   - If a secret may be exposed: **rotate it in Secrets Manager** and redeploy
     (`update-service --force-new-deployment`) so tasks pick up the new value.
   - If needed, scale the service to 0 or put WAF in block mode.
3. **Eradicate:** patch the vulnerability; redeploy a fixed image.
4. **Recover:** restore from RDS backup if data integrity is affected; verify health.
5. **Post-mortem:** timeline, root cause, corrective actions; update this runbook
   and `SECURITY_HARDENING_REPORT.md`.

> Contacts: see `AUDITOR_TEST_ACCOUNTS_TEMPLATE.md` / `VAPT_HANDOVER_CHECKLIST.md`
> §8 (kept out of band, not in Git).
