# Final Smoke Test Runbook (Stage 8)

**Target: `https://www.exorain.com`. Mode: INR_ONLY. Crypto globally disabled.**

> Manual, non-destructive UI walkthrough to confirm the staging platform behaves
> as documented at audit freeze. Use two browsers (A and B) and a KYC-approved
> test user + a SUPER_ADMIN (credentials handed over out of band — do **not**
> commit real passwords). Record PASS/FAIL + screenshot per step.

Result key: ✅ pass · ❌ fail · N/A. Do not perform destructive actions.

---

## A. User flows

| # | Test | Expected | Result |
|---|---|---|---|
| 1 | Open homepage | Homepage loads (no errors) | |
| 2 | Go to login | Login page requests browser location permission | |
| 3 | **Deny** location, attempt login | Login blocked (`LOCATION_REQUIRED`) | |
| 4 | **Allow** location, login | Login succeeds, session issued | |
| 5 | Login in browser A, then browser B (same user) | Browser A session revoked (`SESSION_REVOKED_BY_NEW_LOGIN`) on next action | |
| 6 | Dashboard greeting | "Welcome back, `<real name>`" (dynamic, not `trader`) | |
| 7 | Profile data | Real or empty — **no** `Rahul Verma` / `Mumbai` / `Maharashtra` / `400001` | |
| 8 | Trading summary | `0` or real values only — no fake PnL/win-rate | |
| 9 | Settings → alerts | Real or empty only — no fake/dummy alerts | |
| 10 | Active devices | Shows `1` / current device (real), no phantom "Active Devices 3" | |
| 11 | INR wallet balance | Real balance | |
| 12 | KYC-forced state | Blocks financial actions until KYC satisfied | |
| 13 | UTR / reference copy button | Copies value correctly | |

## B. Crypto-disabled checks (must stay OFF)

| # | Test | Expected | Result |
|---|---|---|---|
| 14 | Crypto deposit surface | Blocked / hidden | |
| 15 | Crypto wallet surface | Blocked / hidden | |
| 16 | Crypto withdrawal surface | Blocked / hidden | |
| 17 | Direct crypto API (unauth) | 401/403 / feature-disabled, never 2xx data | |

## C. INR money-movement (verify, do not abuse)

| # | Test | Expected | Result |
|---|---|---|---|
| 18 | INR deposit flow | Works (approval / UTR capture) | |
| 19 | INR withdrawal flow | Works; **step-up auth required** before submit | |

> Use test amounts only; do not attempt fraud/abuse. This confirms the flow is
> intact, not a load/abuse test.

## D. Admin flows

| # | Test | Expected | Result |
|---|---|---|---|
| 20 | Admin login | Works (TOTP required) | |
| 21 | Admin profile / activity page | Loads; shows real activity | |
| 22 | Deactivate / reactivate admin | Works **only** for SUPER_ADMIN | |
| 23 | Admin self-deactivate | Blocked | |
| 24 | Admin activity timeline | Shows real approvals/actions | |

## D2. Stage 9A — consent, support, wallet, hidden features

| # | Test | Expected | Result |
|---|---|---|---|
| 25 | Signup without ticking all policy boxes | Blocked (Terms/Privacy/Risk required) | |
| 26 | Signup with all policies accepted | Succeeds; acceptance recorded (admin can view under user's legal acceptances) | |
| 27 | Existing user without consent, after login | Consent banner shown; financial actions (KYC/deposit/withdrawal/trading) gated with `CONSENT_REQUIRED` | |
| 28 | Wallet page INR balance | Shows real INR available/locked/total (not ₹0 when funded); loading/empty/error states correct | |
| 29 | Referral tab / Refer & Earn card | Hidden | |
| 30 | API Management tab | Hidden | |
| 31 | User creates a support ticket | Ticket created with ticket number; appears in the user's list only | |
| 32 | Admin replies to the ticket | User sees the reply; status → WAITING_FOR_USER | |
| 33 | Admin resolves the ticket | User sees RESOLVED; system message added | |
| 34 | User B tries to open User A's ticket | 404 TICKET_NOT_FOUND (no cross-user access) | |
| 35 | Support message with `<script>` | Rejected (HTML not allowed) | |
| 36 | Copy ticket number / reference (UTR) button | Copies correctly | |
| 37 | Internal admin note | Visible to admins only, never to the user | |

## E. Sign-off

- [ ] All Section A steps pass (or gaps recorded).
- [ ] Crypto stays blocked/hidden (Section B).
- [ ] INR deposit/withdrawal intact with step-up (Section C).
- [ ] Admin RBAC + lifecycle correct (Section D).
- [ ] No fake/demo data observed anywhere.
- [ ] Screenshots captured (redacted, no real PII/secrets).

Tester: `<name>` · Date: `<date>` · Environment: staging `www.exorain.com`.

---

**Read-only walkthrough. No crypto enablement, no destructive actions, no real
money-movement abuse.**
