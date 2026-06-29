# KYC Policy

**Mode: INR_ONLY staging/demo.** KYC runs on **mock/placeholder providers** in
this environment — **no real vendor integration is claimed.** This policy
defines the process and the production requirements.

---

## 1. Purpose & scope

Defines customer identification and verification (KYC) for EXORA users before
they can transact on INR rails. Aligns with PMLA/KYC expectations for a reporting
entity; full operational compliance requires the production controls in §9.

## 2. KYC lifecycle

States are governed by a single status machine
(`backend/src/modules/kyc/kyc.status.ts`); transitions are enforced server-side:

```
NOT_STARTED ─▶ PENDING ─▶ IN_REVIEW / MANUAL_REVIEW ─▶ APPROVED
                              │                         └▶ (tier assigned)
                              ├─▶ NEEDS_MORE_INFO ─▶ (resubmit)
                              └─▶ REJECTED
```

KYC approval gates access to INR deposit/withdrawal (KYC-required checks in the
deposit/withdrawal services).

## 3. Customer onboarding

1. User submits profile: full name, DOB, PAN, optional tokenized Aadhaar
   reference, address. Input is strictly validated (zod), PAN format enforced.
   Evidence: `backend/src/modules/kyc/kyc.validators.ts`,
   `kyc.service.ts` (`submitProfile`).
2. A verification session is opened with the configured provider (**mock** in
   staging).
3. User submits identity documents as metadata (type, SHA-256, content-type, and
   optional size); the file is uploaded directly to object storage via a
   short-lived URL.

## 4. Document / selfie / liveness (placeholder)

- **Document verification** and **liveness/selfie** are represented by provider
  abstractions running in **mock** mode (`KYC_PROVIDER=mock`,
  `KYC_LIVENESS_PROVIDER=mock`). No real biometric or document check occurs in
  staging.
- **Upload safety (implemented):** the backend allowlists document MIME types to
  `image/jpeg`, `image/png`, `application/pdf` only — executables, scripts,
  archives, HTML and SVG are rejected — and enforces a maximum size
  (`KYC_MAX_UPLOAD_BYTES`, default 10 MiB), both at the request validator and as
  a server-side defense-in-depth check.
  Evidence: `kyc.validators.ts` (`ALLOWED_KYC_MIME_TYPES`), `kyc.service.ts`
  (`submitDocument`), tests in `test/unit/kyc-validators.test.ts` and
  `test/unit/kyc-service.test.ts`.
- **Malware/AV scanning** of uploaded files is a **production requirement** (not
  implemented in staging) — see `production-blockers.md`.

## 5. Manual review

- Admins with the appropriate RBAC permission review the KYC queue and a
  per-user detail view (masked PII only).
- Decisions: **APPROVE** (assigns a KYC tier), **REQUEST_INFO** (user resubmits),
  **REJECT** (with a user-safe reason). An internal compliance note can be added
  and is never returned on user APIs.
  Evidence: `kyc.service.ts` (`decide`, `getDetail`, `addComplianceNote`).
- Every decision is written to both the append-only `audit_logs` and the
  `admin_logs` trail with the acting admin and reason.

## 6. Reject / resubmit

- REJECT is terminal for the current submission; REQUEST_INFO/NEEDS_MORE_INFO
  keeps the user un-approved (all gates still block) but allows resubmission.
- Status transitions are validated by the status machine so the provider path
  and the manual path stay consistent.

## 7. Record retention

- KYC profiles and decisions are retained per `record-retention-policy.md`
  (financial/KYC retention is a multi-year production policy; the compliance
  retention registry records policy years and **never auto-deletes**).
  Evidence: `backend/src/modules/compliance/retention.service.ts`.

## 8. Privacy / PII protection

- PAN and the Aadhaar reference are **encrypted at rest** (AES-256-GCM) and stored
  only as ciphertext (`*_enc` columns); a masked form is used for display.
  Evidence: `backend/src/lib/encryption.ts`, `kyc.service.ts` (`submitProfile`).
- PII is **never written to logs or audit metadata** (audit records the
  non-sensitive shape only); logs redact sensitive keys.
- Raw Aadhaar numbers are never accepted — only a tokenized reference.

## 9. Production requirements (not implemented in staging)

- Real KYC/liveness/document vendor integration (replacing mocks).
- Malware/AV scanning of uploads and real object-storage with private buckets.
- KMS-managed key for PII encryption (currently derived from a config secret).
- Enhanced due diligence wiring for high-risk customers (see `aml-cft-policy.md`).

**Do not represent EXORA KYC as vendor-integrated or production-compliant until
§9 is complete.**
