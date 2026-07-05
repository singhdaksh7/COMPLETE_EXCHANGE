# KYC / AML Technical Workflow (Stage 7)

**Status: TECHNICAL-READINESS EVIDENCE — staging/demo (INR_ONLY). Not a
compliance claim; no vendor integration implemented here.** Describes the
*technical* onboarding/KYC/AML data flow and the records it produces. Policy
intent lives in `docs/compliance/kyc-policy.md` and `aml-cft-policy.md`.

---

## 1. User registration

- Account creation via `auth.service.ts` (Argon2id password hashing) →
  table `User`. New accounts are **INR-only by default** (crypto positive flags
  default OFF — `feature-controls.types.ts`).
- Auth events recorded in `AuditLog` (`auth.register`, `auth.login`, etc.).

## 2. Email verification / staging bypass status

- Email verification system (tokens/OTP) is implemented; `REQUIRE_EMAIL_VERIFICATION`
  gates first login.
- **Staging/demo bypass:** `ALLOW_UNVERIFIED_LOGIN` may be `true` in staging
  while SES approval is pending — it lets unverified accounts log in **without**
  changing the verification system itself. This flag has **no production
  override**: real production refuses to boot with it on (`prod-safety.ts`). For
  an audit, note whether it is currently set on staging (it should be disabled
  for a clean demo where feasible). Surfaced as a staging risk on `/admin/system`.

## 3. KYC submission

- User submits KYC via `/api/v1/kyc/*` (`kyc.routes.ts`, `kyc.service.ts`).
- PII (PAN, Aadhaar reference) is sealed with AES-256-GCM before persistence
  (`lib/encryption.ts`) into the frozen `*_enc` columns of `KycProfile` —
  never stored or logged in plaintext (`lib/logger.ts` redaction).

## 4. KYC file validation

- MIME allowlist (jpeg/png/pdf only; blocks exe/script/archive/HTML/SVG) and
  max size (`KYC_MAX_UPLOAD_BYTES`) — `kyc.validators.ts`, re-asserted server-side
  in `kyc.service.ts`. Document metadata in `KycDocument`.
- **Gap:** upload is a stub; real object storage + malware/AV scanning is a
  future integration (production blocker).

## 5. KYC admin review

- Reviewers act via `/admin/v1/kyc/*` (`kyc.admin.routes.ts`), permission-gated
  (admin RBAC). Decisions write append-only `AdminLog`.
- Provider webhook events recorded in `KycWebhookEvent` (HMAC-verified via
  `KYC_WEBHOOK_SECRET`). Provider is **mock** in staging (`KYC_PROVIDER=mock`).

## 6. Approval / rejection / resubmission

- `KycProfile.status` lifecycle supports approve / reject / resubmit; approval
  may set a KYC tier (`KYC_DEFAULT_APPROVED_TIER`). Each transition is auditable.

## 7. Audit trail around KYC actions

- User-side actions → `AuditLog`; admin decisions → `AdminLog` (both append-only,
  DB trigger rejects UPDATE/DELETE). Pivot on `requestId` to trace a decision.

## 8. Records retained

- `KycProfile` (status, tier, sealed PII refs), `KycDocument` (doc metadata),
  `KycWebhookEvent` (provider callbacks), `AuditLog`/`AdminLog` (actions),
  `ComplianceProfile`/`RiskAssessment`/`ScreeningCheck` (compliance state).
  Retention policy registry: `RecordRetentionPolicy` (never auto-deletes;
  `record-retention-policy.md`).

## 9. Evidence that can be exported

- Compliance evidence packs (`ComplianceEvidencePack`/`...Item`,
  `evidence.service.ts`) and export events (`ComplianceExportEvent`).
- Read-only technical evidence via `scripts/compliance/collect-fiu-technical-evidence.ps1`
  (metadata only; no PII by default). PII export for a specific case is a
  controlled, redaction-aware manual step (see `fiu-reporting-readiness-runbook.md`).

## 10. Missing real vendor / liveness / sanctions integration

- KYC/liveness: **mock** (`compliance/liveness/`). Screening (sanctions/PEP/
  adverse-media): **mock** (`compliance/screening/`). These are wiring-complete
  abstractions awaiting a real vendor; **no real vendor is integrated** and none
  is added in this stage. Gates `COMPLIANCE_REQUIRE_LIVENESS` /
  `COMPLIANCE_REQUIRE_SANCTIONS_BEFORE_APPROVAL` default permissive in staging.

## 11. Future AML review queue (concept, not implemented now)

- The case/workspace scaffolding (`ComplianceCase`, `workspace.service.ts`,
  `workspace.sla.ts`) can back an analyst review queue with SLA tracking. A real
  queue needs: real screening results, tuned alert rules, a named compliance
  officer, and documented SOPs.

## 12. Future suspicious-activity escalation (concept)

- Detection-only monitoring (`monitoring.rules.ts`) already raises
  `ComplianceAlert` → `ComplianceCase`. Escalation to an **STR** is a
  **legal/compliance decision and process** (assemble draft via `fiu.service.ts`,
  then file via the legal channel). **No automated STR filing exists or is
  claimed.**

---

**No vendor integration is implemented in this stage.** This documents the
existing technical flow and the explicit gaps for a future FIU/legal review.
