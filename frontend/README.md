# CEX Console (frontend)

Minimal Next.js (App Router) + Tailwind + React Query frontend for the completed
backend modules (auth + KYC). Focus is functionality, not design.

## Pages

**User** (talks to `NEXT_PUBLIC_API_URL`, default `http://localhost:4000/api/v1`)

| Route          | Purpose                                        |
| -------------- | ---------------------------------------------- |
| `/register`    | Create an account                              |
| `/login`       | Log in (stores access + refresh tokens)        |
| `/dashboard`   | Profile + KYC status summary                   |
| `/kyc/submit`  | Submit KYC profile (PII) + register documents  |
| `/kyc/status`  | View KYC status, tier, reject reason, documents|

**Admin** (talks to `NEXT_PUBLIC_ADMIN_API_URL`, default `http://localhost:4001/admin/v1`)

| Route               | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `/admin/login`      | Admin login (email + password + TOTP)    |
| `/admin/dashboard`  | Admin identity, roles, permissions       |
| `/admin/kyc`        | KYC review queue + approve/reject + tier |

## Setup

```bash
cd frontend
cp .env.local.example .env.local      # adjust if your backend ports differ
npm install
npm run dev                           # http://localhost:3000
```

## Backend prerequisites

The browser calls the backend directly, so the backend must allow this origin
and (for local testing) not block first login on email verification.

In `backend/.env` set:

```
CORS_ORIGINS=http://localhost:3000
REQUIRE_EMAIL_VERIFICATION=false      # so a freshly registered user can log in
```

Then run the two backend processes (separate ports):

```bash
cd backend
npm run dev          # user API  -> :4000
npm run dev:admin    # admin API -> :4001
```

### Admin & permissions

- Seed an admin and the `kyc.view` / `kyc.review` permissions (see
  `backend/prisma/seed.sql`). The admin's role must hold both to use the queue
  and to decide.
- If the admin has TOTP disabled, enter `000000` in the TOTP field (the API still
  requires a 6-digit value by schema).

## Notes / trade-offs

- Tokens live in `localStorage` (two scopes: user + admin). Production would use
  httpOnly cookies — deliberate simplification.
- The user API client transparently refreshes the access token once on a 401.
  The admin API has no refresh endpoint, so a 401 bounces to `/admin/login`.
- All data access goes through the existing OpenAPI endpoints; no business logic
  lives in the frontend.
