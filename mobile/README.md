# EXORA Mobile — Stage 6.0A (Android User App MVP)

Expo + React Native + TypeScript user/trader app for the EXORA staging CEX.
**User-only — there is no admin, compliance-officer, RBAC, STR, wallet-risk, or
Travel Rule surface in this app.** Those remain on the separate web admin panel.

Android-first; the codebase is kept iOS-compatible (no Android-only APIs) so a
later iOS build via Expo / EAS works without restructuring.

## Tech
- Expo SDK 51, React Native 0.74, TypeScript (strict)
- Expo Router (file-based navigation, `app/`)
- `expo-secure-store` for token storage (Android Keystore / iOS Keychain)
- Reusable typed API client + central auth/session context
- Dark crypto-exchange theme, loading / empty / error states throughout

## Configuration
The API base URL is read from an environment variable (no secrets in the app):

```
EXPO_PUBLIC_API_URL=https://dfk68tws8g8oj.cloudfront.net/api/v1
```

Copy `.env.example` to `.env` to override. If unset, it defaults to the staging
CloudFront URL above. Only `EXPO_PUBLIC_*` vars are inlined into the bundle.

## Setup

```bash
cd mobile
npm install
cp .env.example .env        # optional; defaults to staging
```

## Run (Android)

```bash
# Start the Metro bundler / Expo dev server
npx expo start

# then press "a" to open Android, or:
npx expo start --android
```

### Android emulator / device
- **Emulator:** install Android Studio → create an AVD (Pixel + recent system
  image) → start it → run `npx expo start --android` (Expo installs Expo Go and
  opens the app). Or press `a` in the Expo CLI.
- **Physical device:** install **Expo Go** from the Play Store, ensure the phone
  is on the same network as your machine, run `npx expo start`, and scan the QR
  code. (Set `EXPO_PUBLIC_API_URL` to the public CloudFront URL — already the
  default — so the device can reach the API.)

## Type check

```bash
npm run typecheck     # tsc --noEmit
```

## Project structure

```
mobile/
  app/                      # Expo Router route tree (thin re-exports)
    _layout.tsx             # root: providers + auth gate + stack
    (auth)/                 # login, register, verify-email
    (tabs)/                 # home, markets, portfolio, profile (bottom tabs)
    market/[symbol].tsx     # market detail
    trade, orders, transactions, deposit, withdraw, kyc, notifications, security
  src/
    api/        client.ts (envelope + refresh), userApi.ts (typed endpoints)
    components/ ui.tsx (Screen, Card, Button, Input, StatusBadge, states…)
    config/     env-driven API base
    hooks/      useApi (loading/error/empty)
    navigation/ route path constants
    screens/    one component per screen (imported by app/ routes)
    store/      auth.tsx (session context), tokenStore.ts (secure-store)
    theme/      dark theme tokens
    types/      api.ts (user-only DTO shapes mirrored from backend)
    utils/      format helpers
```

## Screens (17)
Splash, Login, Register, Verify-email, Home dashboard, Portfolio, Markets,
Market detail, Trade, Orders (open + history), Transactions (deposits /
withdrawals / trades), Deposit (crypto address + manual INR), Withdraw, KYC
status (read-only), Notifications, Profile, Security (password / sessions /
logout).

Home dashboard shows: estimated balance, quick actions (Deposit / Withdraw /
Trade / KYC), market snapshot, a recent-transactions entry point, and the
KYC/compliance status badge.

## APIs integrated (all existing user endpoints — no backend changes)
- Auth: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/me`,
  `/auth/verify-email`, `/auth/resend-verification`, `/auth/change-password`,
  `/auth/sessions`
- Wallet/portfolio: `/wallets/overview`, `/wallets/:asset`, `/wallets/addresses`,
  `/wallets/deposits`, `/wallets/:asset/ledger`
- INR deposit: `/inr/deposits/manual`, `/inr/deposits`
- Withdrawal: `/withdrawals`, `/withdrawals/addresses`
- Markets: `/markets`, `/markets/:symbol/ticker`, `/markets/:symbol/orderbook`
- Orders/trades: `/orders`, `/orders/open`, `/orders/:id` (cancel), `/trades`
- KYC/compliance (read-only status): `/kyc`, `/kyc/status`
- Notifications: `/notifications`, `/notifications/:id/read`,
  `/notifications/read-all`

## Known limitations (demo-safe)
- **No price aggregation:** "Estimated balance" shows the INR available balance
  plus a per-asset breakdown. Cross-asset fiat valuation is not computed (the
  backend exposes no portfolio-valuation endpoint), so no numbers are invented.
- **Full enhanced-KYC submission stays on web.** The mobile KYC screen is
  read-only status; PAN/Aadhaar/liveness capture + consents are not collected
  here.
- **No charts/candles** (kept out of MVP) and **no live WebSocket** market feed —
  data is fetched on load / pull-to-refresh.
- **No push notifications** (in-app list only).
- **No clipboard dependency:** addresses are selectable text (long-press to copy).
- Withdrawals/deposits use only the existing backend behaviour; nothing new is
  enabled and approvals still happen on the admin side.

## Missing / unclear backend endpoints (none were invented)
- Portfolio fiat valuation / total-equity endpoint (would replace the INR-only
  headline). Not present today.
- A combined "transactions" feed (the app merges crypto deposits, INR deposits,
  withdrawals and trades client-side from their separate endpoints).
- If `/kyc/status` returns 404/empty for a user without a compliance profile, the
  app falls back to the legacy `/kyc` status and `user.kycStatus` — handled with
  empty states, nothing is fabricated.

## Confirmations
- ✅ **No admin panel / compliance-officer screens** are included in this app.
- ✅ **iOS-compatible:** only cross-platform Expo/React Native APIs are used
  (`expo-secure-store`, `expo-router`, `react-native-safe-area-context`), an iOS
  `bundleIdentifier` is set, and no Android-only native code exists — a later
  Expo/EAS iOS build needs no restructuring.
- ✅ **No backend/admin API changes**; trading engine, ledger, scanner,
  withdrawal signing, KYC, compliance, RBAC, STR, wallet-risk and Travel Rule
  logic are untouched.
- ✅ **No secrets in the app**; API base is environment-driven and the app only
  calls the public user API.
