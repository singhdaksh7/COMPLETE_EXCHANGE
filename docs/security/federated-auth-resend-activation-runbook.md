# Federated Auth (Google/Apple via Firebase) + Resend — Activation Runbook

Stage 12 shipped CODE READY, CONFIG REQUIRED. This runbook is what an operator
does, in order, once real Resend and Firebase/Google/Apple credentials exist.
Nothing in this document has been executed — no external resource was created,
no secret was generated, no DNS/DB change was made as part of this stage.

Architecture reminder: Firebase Authentication is a verification layer only.
Google/Apple → Firebase → Firebase ID token → EXORA backend verifies the
token → EXORA's own user/session/2FA/location rules → EXORA access/refresh
tokens. Firebase never becomes an EXORA session token, and EXORA's existing
email/password login is untouched.

---

## 1. Resend activation

1. Create a Resend account and add/verify a sending domain (SPF + DKIM DNS
   records at the DNS provider for the real sending domain, e.g.
   `mail.exorain.com`). Do not use a shared/default Resend testing domain for
   production sends.
2. Create a Resend API key scoped to sending only.
3. Backend config (set wherever this environment's secrets are injected —
   never commit them):
   - `MAIL_PROVIDER=resend`
   - `RESEND_API_KEY=<the key>`
   - `RESEND_FROM_EMAIL=<verified address on the verified domain>`
   - `RESEND_FROM_NAME=Exora` (or the desired display name)
4. Redeploy the backend so the new `MAIL_PROVIDER` takes effect. Env
   validation (`backend/src/config/env.ts`) refuses to boot if
   `RESEND_API_KEY`/`RESEND_FROM_EMAIL` are missing while
   `MAIL_PROVIDER=resend` — this is intentional fail-fast, not a bug.
5. Send a safe test email: trigger `POST /auth/forgot-password` (or
   `/auth/resend-verification`) for a real test inbox and confirm delivery
   end-to-end through Resend's dashboard.
6. Configure the Resend webhook: Resend dashboard → Webhooks → point at
   `POST {API_BASE}/api/v1/webhooks/resend`, subscribe to the delivery events
   you want telemetry for (`email.sent`, `email.delivered`, `email.bounced`,
   `email.complained` at minimum).
7. Copy the webhook's signing secret into `RESEND_WEBHOOK_SECRET` and
   redeploy. Until this is set, the webhook endpoint rejects every event as
   unverified (`WEBHOOK_SIGNATURE_MISSING`/`503`) — it never fakes success.
8. Verify delivery/bounce events land as `email.delivery_event` audit-log rows
   (`backend/src/lib/audit.ts` → `AuditAction.EMAIL_DELIVERY_EVENT`); there is
   no dedicated email-delivery table by design (see Phase 5 note in the
   implementation prompt) — query the append-only audit log instead.

Rollback: set `MAIL_PROVIDER=ses` (existing, already-implemented provider) or
`MAIL_PROVIDER=log` (safe offline stub) and redeploy — no code change needed.

---

## 2. Firebase project setup

1. Create a **staging** Firebase project first (never point staging traffic
   at a production Firebase project).
2. Authentication → Sign-in method → enable **Google**. Enable **Apple**
   later, once Apple Developer credentials exist (§4).
3. Register a **Web app** in the Firebase project → copy the web config
   (`apiKey`, `authDomain`, `projectId`, `appId`).
4. Register an **Android app** with package name `com.exora.mobile` (already
   set in `mobile/app.json` — do not change it). Add the app's release +
   debug **SHA-1 and SHA-256** certificate fingerprints (required for native
   Google Sign-In) — `keytool -list -v -keystore <path>` or
   `eas credentials` for the EAS-managed keystore.
5. Register an **iOS app** with the bundle identifier from `mobile/app.json`
   (`com.exora.mobile` — already set, do not change it).
6. Download `google-services.json` (Android) and `GoogleService-Info.plist`
   (iOS). These are NOT committed to git — see step 9.
7. Firebase Admin (backend verification): Project settings → Service accounts
   → generate a new private key (JSON). Extract `project_id`, `client_email`,
   `private_key` into:
   - `FEDERATED_AUTH_ENABLED=true`
   - `FIREBASE_PROJECT_ID=<project_id>`
   - `FIREBASE_CLIENT_EMAIL=<client_email>`
   - `FIREBASE_PRIVATE_KEY=<private_key>` (keep the `\n` sequences as literal
     `\n` in the env value — `backend/src/config/index.ts` un-escapes them)
   Store the raw downloaded JSON file itself in the team's secret manager, not
   in the repo or in plaintext env files.
8. Redeploy the backend. Confirm readiness: with `FEDERATED_AUTH_ENABLED=true`
   and the three Firebase vars set, `POST /auth/federated/firebase` should
   verify a real Firebase ID token instead of returning
   `FEDERATED_AUTH_DISABLED`/`SERVICE_UNAVAILABLE`.
9. Frontend (web) config — public, non-secret client values:
   - `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   Rebuild/redeploy the frontend. The "Continue with Google" button
   (`frontend/components/federated-google-button.tsx`) renders only once both
   this flag and all four values are present — never a dead button before
   that.
10. Mobile config — see the mobile fork's report for the exact
    `EXPO_PUBLIC_FIREBASE_*` / `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED` variable set
    it wired up, plus where `google-services.json` /
    `GoogleService-Info.plist` must be placed before an EAS build.

Rollback: set `FEDERATED_AUTH_ENABLED=false` (backend) and
`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false` / `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=false`
(web/mobile) and redeploy — the endpoint returns a safe disabled response, the
buttons disappear, nothing else changes.

---

## 3. Apple Sign-In activation (iOS only)

1. Apple Developer account: enable "Sign In with Apple" capability for the
   app's App ID (`com.exora.mobile`).
2. Firebase → Authentication → Sign-in method → enable **Apple**, supplying
   the Services ID / Team ID / Key ID / private key per Firebase's Apple
   provider setup flow.
3. Mobile config: `EXPO_PUBLIC_APPLE_AUTH_ENABLED=true` (iOS builds only —
   the button never renders on Android regardless of this flag).
4. Remember: Apple only returns the user's name on the FIRST authorization.
   The mobile code anchors identity on the verified Firebase/Apple subject,
   never on the name — do not "fix" a missing name on a later login, it is
   expected Apple behavior.

Rollback: `EXPO_PUBLIC_APPLE_AUTH_ENABLED=false`.

---

## 4. Android / iOS rebuild requirements

Stage 12 is CODE READY only — no new EAS build was triggered as part of this
stage (Phase 25). Before Google/Apple sign-in works on a real device:

1. Place the real `google-services.json` (Android) and
   `GoogleService-Info.plist` (iOS) where the mobile fork's report says the
   native config plugins expect them (do not fabricate placeholder files —
   none exist in this repo).
2. A custom dev-client or production EAS build is required — Google/Apple
   native sign-in is NOT available in Expo Go.
3. Android: `eas build --platform android --profile <profile>`, install the
   resulting build, verify "Continue with Google" end-to-end against the
   staging Firebase project.
4. iOS: `eas build --platform ios --profile <profile>` (or TestFlight
   distribution), verify both Google and Apple sign-in end-to-end.
5. Only after both are verified against staging should the same steps be
   repeated against a production Firebase project + production EAS profile.

---

## 5. Rollback summary (any stage)

| Concern | Flag to flip | Effect |
|---|---|---|
| Resend misbehaving | `MAIL_PROVIDER=ses` or `log` | Reverts to existing SES/offline mail, no code change |
| Firebase/Google web misbehaving | `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false` | Button disappears, password/OTP login unaffected |
| Firebase/Google mobile misbehaving | `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=false` | Button disappears |
| Apple sign-in misbehaving | `EXPO_PUBLIC_APPLE_AUTH_ENABLED=false` | Button disappears (iOS only anyway) |
| Federated endpoint itself misbehaving | `FEDERATED_AUTH_ENABLED=false` (backend) | Endpoint returns a safe disabled response; existing legacy `/auth/google/*` OAuth routes are untouched and keep working |

None of these rollbacks require a schema migration revert — every Stage 12
migration is additive-only (`user_federated_identities` table; nothing else
was altered).
