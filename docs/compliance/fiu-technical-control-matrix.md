# FIU Technical Control Matrix (Stage 7)

**Status: TECHNICAL-READINESS EVIDENCE — staging/demo (INR_ONLY). Not a
compliance claim.** Maps each control area to the technical evidence that exists
in EXORA, its status, the source, the owner, and the gap/future action.

Status legend: **Implemented** · **Partial** (works but mock/limited) ·
**Documented** (plan/doc only) · **Future** (vendor/legal dependency).

Owner legend: Backend (BE), Compliance/Admin (CO), Platform/Infra (INFRA),
Legal/External (LEGAL).

---

| Control area | Technical evidence in EXORA | Status | Evidence source (file / API / table / log) | Owner | Gap / future action |
|---|---|---|---|---|---|
| Customer onboarding | Registration + account creation; INR-only defaults | Implemented | `auth.service.ts`; table `User`; `feature-controls.types.ts` (crypto OFF default) | BE | — |
| KYC document capture | Submit + MIME/size validation; PII sealed at rest (AES-256-GCM) | Partial (mock provider) | `kyc.service.ts`, `kyc.validators.ts`; tables `KycProfile`, `KycDocument`; `lib/encryption.ts` | BE/CO | Real KYC/liveness vendor; real object storage + AV scan |
| KYC admin review | Approve/reject, permission-gated; webhook events recorded | Implemented | `kyc.admin.routes.ts`; table `KycWebhookEvent`; admin RBAC | CO | Tie decisions to real vendor results |
| KYC rejection / resubmission | Status lifecycle supports rejection + resubmit | Implemented | `kyc.service.ts` (status transitions); `KycProfile.status` | BE/CO | — |
| User identity records | User profile, contact, KYC tier, risk level | Implemented | table `User`, `KycProfile`, `ComplianceProfile` | BE | Enrich with verified vendor identity |
| User login / auth records | Login attempts, sessions, OTP, lockouts | Implemented | tables `LoginAttempt`, `AuthSession`, `EmailOtp`; `AuditLog` (`auth.*`) | BE | — |
| User 2FA status | TOTP enrollment + backup codes; login enforcement | Implemented | `user-security.service.ts`; `User.totpSecretEnc`, `TotpRecoveryCode` | BE | — |
| Admin authentication | Bearer + server session + per-admin IP allowlist + TOTP | Implemented | `middleware/admin-authenticate.ts`; tables `Admin`, `AdminSession` | INFRA/CO | Edge IP allowlist / VPN (documented) |
| Admin RBAC | Role/permission model, all-of/any-of, maker-checker | Implemented | `middleware/admin-authorize.ts`; tables `Role`, `Permission`, `AdminRole`, `RolePermission` | CO | Periodic least-privilege review |
| Admin action logs | Append-only admin audit (DB trigger blocks mutation) | Implemented | table `AdminLog`; `lib/audit.ts` | CO | Hash-chain (`prev_hash`/`row_hash`) reserved, not populated |
| Admin lifecycle / access removal | SUPER_ADMIN-only soft deactivation + reactivation; sessions revoked; last-super-admin + self guards; row never deleted | Implemented | `admin-rbac.service.ts` (`deactivateAdmin`/`reactivateAdmin`); `Admin.status`/`deactivatedAt`/`deactivatedBy`/`deactivationReason`; `AdminLog` (`admin.deactivate`/`admin.reactivate`) | CO | Idle-session timeout still a platform gap |
| Admin activity traceability | Per-admin profile + filterable activity timeline + derived action summary; no secrets exposed | Implemented | `GET /admin/v1/admins/:id/profile` + `/activity`; derived from `AdminLog` | CO | Bad-password login failures not per-admin logged (Redis-only) |
| INR deposit request records | Manual + gateway deposits; idempotent webhooks | Implemented | `deposit.service.ts`; tables `InrTransaction`, `PaymentWebhookEvent` | BE/CO | Razorpay is mock in staging |
| INR deposit approval / rejection | Maker-checker dual approval; same-approver prevented | Implemented | `deposit.service.ts` (`SAME_APPROVER`); `AdminLog` | CO | — |
| INR withdrawal request records | Lifecycle + step-up auth before request | Implemented | `inr-withdrawal/`; table `InrWithdrawal`; `require-step-up.ts` | BE/CO | — |
| INR withdrawal payout / reference | Payout reference + ledger reserve/release/finalize | Implemented | `inr-withdrawal.service.ts`; `InrWithdrawal`, `LedgerEntry` | BE/CO | Real bank rails are out of scope |
| Ledger transaction records | Double-entry, append-only money truth | Implemented | tables `LedgerTransaction`, `LedgerEntry` | BE | — |
| Balance / account records | Per-account balances + snapshots + reconciliation | Implemented | tables `Account`, `AccountBalance`, `BalanceSnapshot`, `ReconciliationRun` | BE | — |
| Suspicious activity markers / workflow | Detection-only monitoring → alerts + cases | Partial (detection-only, mock data) | `monitoring.rules.ts`, `monitoring.service.ts`; tables `ComplianceAlert`, `ComplianceCase` | CO | Tuned rules; analyst SOP; real data quality |
| Sanctions / PEP / screening | Screening checks + matches | Partial (mock provider) | `screening.service.ts`, `compliance/screening/`; tables `ScreeningCheck`, `ScreeningMatch` | CO | Real screening vendor |
| Risk assessment | Risk scoring + grade per profile | Partial | `compliance.risk.ts`; table `RiskAssessment` | CO | Real signals/vendor inputs |
| FIU draft / report assembly | Draft generation + internal export (never transmitted) | Partial (draft-only) | `fiu.service.ts`, `fiu.admin.routes.ts` | CO/LEGAL | Filing is a legal process, not automated |
| Audit log retention | 180-day CloudWatch retention; DB audit append-only | Implemented (retention documented) | `docs/security/log-retention-180-days.md`; `scripts/observability/` | INFRA | Enforce in IaC; tamper-resistant store |
| Incident response linkage | IR process + alarms + runbooks | Documented | `docs/security/cert-in-incident-response.md`, `alert-runbook.md` | INFRA/CO | Named contacts; drills |
| Secrets protection evidence | Inventory + KMS/IAM readiness; metadata evidence script | Documented + Partial | `docs/security/secret-inventory.md`; `scripts/security/collect-secrets-evidence.ps1` | INFRA | KMS CMK + rotation (blockers) |
| Admin edge security evidence | Edge inventory + WAF plan + evidence script | Documented + Partial | `docs/security/admin-edge-security-readiness.md`, `waf-readiness-plan.md` | INFRA | Tuned WAF; DNS/edge alignment |
| Crypto disabled evidence | INR_ONLY mode; crypto globals OFF; routes gated | Implemented | `crypto-disabled-evidence.md`; `config.featureFlags` | BE | Stays OFF until full sign-off |
| Data retention evidence | Retention policy registry + reviews (never auto-deletes) | Partial | `retention.service.ts`; tables `RecordRetentionPolicy`, `RecordRetentionReview`; `docs/compliance/record-retention-policy.md` | CO | Operationalize reviews |
| Report generation readiness | Compliance evidence packs + exports | Partial | `evidence.service.ts`; tables `ComplianceEvidencePack`, `ComplianceExportEvent` | CO | Standardize for auditor handoff |
| Export / evidence readiness | Read-only evidence scripts (Stage 4–7) | Implemented | `scripts/observability/`, `scripts/security/`, `scripts/compliance/` | INFRA/CO | — |

---

**No FIU compliance is asserted.** "Implemented" means a technical control exists
and is verifiable; it does not mean it is legally sufficient. Mock providers and
draft-only flows are explicitly marked Partial/Future.
