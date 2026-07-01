# Final Security Control Matrix (Stage 8)

**Mode: INR_ONLY staging/demo. Crypto globally disabled.**

> One row per control: what it is, whether it is implemented, where the evidence
> is, how it was last verified, the residual gap, and remediation priority. This
> is a **staging audit-freeze** snapshot — it does not claim production readiness.

Implemented status: ✅ implemented · 🟡 partial / documented gap · ❌ not
implemented · ⏭️ intentionally disabled (control by design).

Priority: **P0** production/FIU blocker · **P1** high · **P2** medium · **P3** low
/ staging-accepted.

---

| Security area | Control | Implemented | Evidence source | Last verified by | Gap | Priority |
|---|---|---|---|---|---|---|
| Auth | Password login, hashed at rest, no user enumeration | ✅ | `code`; `SECURITY_HARDENING_REPORT.md` | manual + code | — | — |
| MFA | User 2FA (TOTP, hashed one-time backup codes, login enforcement) | ✅ | `user-2fa-step-up-auth.md` | manual | — | — |
| MFA | Withdrawal / sensitive-change step-up (5-min single-use token) | ✅ | `user-2fa-step-up-auth.md` | manual | — | — |
| Admin MFA | Admin TOTP required + AES-256-GCM encrypted at rest | ✅ | `admin-access-runbook.md`, `secret-inventory.md` | code | — | — |
| Admin MFA | Admin login lockout on failed attempts | ✅ | `admin-endpoint-safe-checks.md` | manual | — | — |
| Sessions | Absolute session expiry + logout revocation | ✅ | `code` | manual | — | — |
| Sessions | Single active session (prev revoked) | ✅ | `user-session-security.md` | manual | — | — |
| Sessions | Idle / inactivity timeout | 🟡 | `production-blockers.md` #3 | doc | idle timeout missing | P2 |
| Location security | Login location requirement (consented, precision-limited) | ✅ | `user-session-security.md` | manual + script | — | — |
| RBAC | Admin Bearer + role checks; user token rejected on admin API | ✅ | `admin-endpoint-safe-checks.md` | script | — | — |
| RBAC | Per-admin IP allowlist (application layer) | ✅ | `admin-access-runbook.md` | code | edge/network allowlist not enforced | P1 |
| Admin audit | Admin lifecycle (soft-deactivate only) + activity timeline | ✅ | Stage 7A; `admin-access-runbook.md` | manual | — | — |
| User audit | Security events + audit log (append-only) | ✅ | `evidence-pack/README.md` | doc | hash-chain not populated | P2 |
| KYC upload security | MIME + size validation; PII encrypted at rest | ✅ | `kyc-aml-technical-workflow.md`, `secret-inventory.md` | code | real AV scan + object storage | P0 (FIU) |
| INR deposit approval | Admin approval / UTR capture on deposit flow | ✅ | `../compliance/kyc-aml-technical-workflow.md` | manual | — | — |
| INR withdrawal step-up | Step-up gate before INR withdrawal | ✅ | `user-2fa-step-up-auth.md` | manual | — | — |
| Notifications / alerts | Real alerts only (no fake alert/security data) | ✅ | `user-session-security.md`; Stage 8 scan | scan | — | — |
| Fake-data removal | No fake profile/trading/security data in UI | ✅ | Stage 7B; Stage 8 source scan | scan | — | — |
| Crypto disabled gates | All `CRYPTO_*_GLOBAL_ENABLED` false; global-AND-user gate; boot guard | ⏭️ | `crypto-disabled-evidence.md` | script | disabled by design (control) | — |
| CORS | Strict origin allowlist | ✅ | `code` | code | live origins missing in `CORS_ORIGINS` (deploy fix) | P1 |
| Rate limits | Auth/sensitive endpoints rate-limited | ✅ | `admin-endpoint-safe-checks.md` | manual | — | — |
| Security headers | API helmet headers; frontend HSTS | 🟡 | `cloudfront-security-headers-readiness.md` | script | CSP report-only → enforce; CF/S3 headers | P2 |
| Logging | Structured logs + audit trail | ✅ | `evidence-pack/README.md` | doc | — | — |
| Logging | SIEM / tamper-resistant log storage | ❌ | `production-blockers.md` #13 | doc | alarms are not a SIEM | P1 |
| CloudWatch retention | 180-day log retention | 🟡 | `log-retention-180-days.md` | script | not enforced in IaC | P1 (CERT-In) |
| CloudWatch alarms | 5xx/DB/auth-fail/ECS-ALB health/latency/404 | ✅ | `cloudwatch-alarms-plan.md`, `alert-runbook.md` | script | — | — |
| Secrets Manager | Subset of secrets in Secrets Manager (metadata verified) | 🟡 | `secret-inventory.md` | script | full set + injection | P1 |
| KMS readiness | Production CMK plan (`alias/exora/prod/secrets`) | ❌ | `kms-readiness.md` | doc | CMK not created; single derived key today | P0 |
| IAM least privilege readiness | Read-only role/policy review plan | 🟡 | `iam-least-privilege-readiness.md` | script | scoped policies not applied | P1 |
| WAF readiness | Plan + dry-run script (COUNT mode) | 🟡 | `waf-readiness-plan.md`, `admin-edge-security-readiness.md` | script | tuned rules not associated to serving edge | P1 |
| FIU evidence pack | Technical readiness docs + read-only script | ✅ | `../compliance/fiu-evidence-pack/README.md` | script | legal/compliance out of scope | P0 (FIU legal) |
| Incident response | CERT-In IR + per-alarm alert runbooks | ✅ | `cert-in-incident-response.md`, `alert-runbook.md` | doc | not drilled with named contacts | P2 |
| Backup / restore | Restore drill checklist; RDS retention | 🟡 | `backup-restore-drill.md`, `production-blockers.md` #12a | doc | staging retention 1 day; drill not run | P2 |
| VAPT workflow | Scope + checklist + evidence pack + read-only script | ✅ | `vapt-scope.md`, `vapt-evidence-checklist.md` | this pack | independent VAPT not yet run | P0 (prod) |

---

**Cross-references:** authoritative blocker list is
[`../compliance/production-blockers.md`](../compliance/production-blockers.md);
FIU technical matrix is
[`../compliance/fiu-technical-control-matrix.md`](../compliance/fiu-technical-control-matrix.md).

**No production, FIU legal, or production-crypto readiness is claimed.**
