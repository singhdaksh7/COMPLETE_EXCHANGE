# VAPT Evidence Checklist (Stage 8)

**Target: EXORA staging. Mode: INR_ONLY. Crypto globally disabled.**

> A per-area checklist for the auditor/tester to record evidence. Status values:
> ✅ verified · 🟡 partial / documented gap · ❌ not verified / gap ·
> ⏭️ intentionally disabled. Fill Status/Notes during testing.

Legend for **Evidence source**: `script` = `scripts/security/collect-final-audit-evidence.ps1`
output; `manual` = smoke-test runbook; `doc` = referenced markdown; `code` = source.

---

## 1. Authentication

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Login with valid creds + location | Success, session issued | manual | | |
| Login with invalid creds | Rejected, no user enumeration | manual/code | | |
| Password stored hashed (no plaintext) | Hash only (argon2/bcrypt) | code | | |
| Brute-force throttling on login | Rate-limited/locked | doc `admin-endpoint-safe-checks.md` | | |

## 2. User 2FA

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Enroll TOTP / confirm | `2FA_REQUIRED` challenge → `/auth/2fa/verify` | doc `user-2fa-step-up-auth.md` | | |
| Backup codes hashed, one-time | Single-use, hashed at rest | code | | |
| 2FA verify rate-limited | Throttled | doc | | |
| TOTP secret encrypted at rest | AES-256-GCM | doc `secret-inventory.md` | | |

## 3. Admin 2FA

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Admin login requires TOTP | Enforced | doc `admin-access-runbook.md` | | |
| Admin TOTP encrypted at rest | AES-256-GCM | doc `secret-inventory.md` | | |
| Admin login lockout on failures | Locked/throttled | doc | | |

## 4. Session management

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Absolute session expiry | Expired session rejected | code | | |
| Idle/inactivity timeout | 🟡 absolute only; idle **missing** | doc `production-blockers.md` #3 | 🟡 | documented gap |
| Logout revokes token | Token unusable after logout | manual | | |

## 5. Single active session

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Login B revokes login A | `SESSION_REVOKED_BY_NEW_LOGIN` on A | manual/doc `user-session-security.md` | | |
| Active devices shows 1/current | No phantom devices | manual | | |

## 6. Login location requirement

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Deny browser location | Login blocked `LOCATION_REQUIRED` | manual/script | | |
| Allow location | Login proceeds | manual | | |
| Location stored with consent, limited precision | Privacy-limited | doc `user-session-security.md` | | |

## 7. Authorization / RBAC

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| User token on admin endpoint | 401/403 | script/doc `admin-endpoint-safe-checks.md` | | |
| Non-SUPER_ADMIN on privileged action | Denied | manual | | |
| Per-admin IP allowlist (app layer) | Enforced | doc `admin-access-runbook.md` | | |

## 8. IDOR checks

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Access another user's object by id | 403/404, no leak | manual | | |
| Admin object access requires admin | 401/403 for user token | manual | | |

## 9. Admin lifecycle controls

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Deactivate/reactivate admin | Only SUPER_ADMIN | manual | | |
| Admin cannot self-deactivate | Blocked | manual | | |
| Delete = soft-deactivate only | No hard delete | code/doc | | |
| Admin activity timeline populated | Real actions traced | manual | | |

## 10. KYC upload controls

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Upload wrong MIME/oversize | Rejected | doc `kyc-aml-technical-workflow.md` | | |
| Malware/AV scan | ❌ stub; real AV a blocker | doc `production-blockers.md` #5 | ❌ | gap |
| KYC PII encrypted at rest | AES-256-GCM | doc `secret-inventory.md` | | |

## 11. INR deposit controls

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Deposit requires admin approval where applicable | Approval gate | doc `../compliance/kyc-aml-technical-workflow.md` | | |
| UTR/reference captured | Recorded | manual | | |

## 12. INR withdrawal step-up controls

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Withdrawal without step-up | Blocked | doc `user-2fa-step-up-auth.md` | | |
| Step-up token stale/reused | Rejected (5-min single-use) | doc | | |

## 13. Ledger / accounting immutability evidence

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Ledger entries append-only | No mutate/delete path | code/doc | | |
| Audit log append-only | Enforced | doc | | |
| Audit hash-chain populated | ❌ columns reserved, not populated | doc `production-blockers.md` #16 | ❌ | gap |

> Do not test by mutating ledger state — verify by code/design review only.

## 14. Crypto disabled evidence

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Crypto deposit/withdraw/wallet endpoint (unauth) | Blocked / 401/403 | script/doc `../compliance/crypto-disabled-evidence.md` | ⏭️ | disabled by design |
| `CRYPTO_*_GLOBAL_ENABLED` values | All false | script | ⏭️ | |
| Frontend hides crypto surfaces | Hidden | manual | ⏭️ | |

## 15. CORS

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Disallowed origin | Blocked (strict allowlist) | code | | |
| Live origins present in `CORS_ORIGINS` | 🟡 deploy-time fix flagged | doc `production-blockers.md` #10e | 🟡 | |

## 16. Security headers

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| API helmet headers | Present | code | | |
| Frontend HSTS / CSP | 🟡 HSTS on www; CSP report-only staged | doc `cloudfront-security-headers-readiness.md` | 🟡 | |

## 17. Rate limiting

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Auth endpoints rate-limited | Throttled | doc `admin-endpoint-safe-checks.md` | | |

## 18. Error handling

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Errors do not leak stack/secrets | Sanitized | code | | |
| 404/500 safe responses | No internal detail | manual | | |

## 19. Logging / audit trails

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Security events logged | Audit events written | doc `evidence-pack/README.md` | | |
| 180-day retention | ≥180 days | script/doc `log-retention-180-days.md` | | |
| SIEM / tamper-resistant | ❌ alarms are best-effort, not SIEM | doc `production-blockers.md` #13 | ❌ | gap |

## 20. Secrets handling

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| No secrets in repo/frontend bundle | None | script/manual | | |
| Secrets in Secrets Manager (subset) | Metadata only | doc `secret-inventory.md` | | |
| KMS CMK + rotation | ❌ blocker | doc `production-blockers.md` #9,#12b | ❌ | gap |

## 21. Backup / retention evidence

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| RDS backup retention | 🟡 staging default 1 day | doc `production-blockers.md` #12a | 🟡 | staging accepted |
| Restore drill | 🟡 checklist not executed | doc `backup-restore-drill.md` | 🟡 | |

## 22. CloudWatch alarms

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| Alarms present (5xx/DB/auth-fail/health/latency) | Present | script/doc `cloudwatch-alarms-plan.md` | | |

## 23. Incident response docs

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| CERT-In IR runbook exists | Present | doc `cert-in-incident-response.md` | | |
| Alert runbook per alarm | Present | doc `alert-runbook.md` | | |

## 24. FIU technical readiness docs

| Test | Expected result | Evidence source | Status | Notes/gaps |
|---|---|---|---|---|
| FIU technical evidence pack present | Present | doc `../compliance/fiu-evidence-pack/README.md` | | |
| Vendor/legal gaps documented | Documented (not claimed done) | doc `../compliance/fiu-technical-readiness.md` | | |

---

**No destructive testing. Verify ledger/crypto/secrets by review, not by mutating
state. Staging INR_ONLY.**
