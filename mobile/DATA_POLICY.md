# EXORA Mobile — No Fake Financial Data Policy

This app is built for FIU / cybersecurity audit presentation. **Every financial
value shown to the user must come from a real backend API response, or be a safe
empty state.** There is no fake, mock, seeded, sample, or placeholder financial
data anywhere in the app.

## Hard rules

1. **No fabricated values.** Balances, prices, tickers, order books, trades,
   orders, deposits, withdrawals, holdings and portfolio totals are rendered
   **only** from live API responses (`userApi.*`). If the API has no data, the
   screen shows an explicit empty state — never a zero, a dash dressed up as a
   value, or a hardcoded number.
2. **Null-safe formatting.** `src/utils/format.ts` returns `—` (em dash) for any
   missing/empty numeric value. A `—` means "no data from the API", not "0".
3. **No demo/mock modules.** There is no `demoData`, `staticData`, `mock*`,
   `dummy*`, `sample*` source of financial data in `mobile/src`. If a dev-only
   fixture is ever introduced, it must live behind a disabled-by-default flag and
   never ship in a build.
4. **Markets come from the backend only.** The only tradable markets are those
   the API returns (currently `BTC-USDT`, `ETH-USDT`, `BNB-USDT`, `USDT-INR`).
   No symbol is hardcoded into a list shown as if it were live market data.
   (`USDT-INR` appears once as a *navigation default* for the trade route, not as
   a displayed price.)

## Crypto funding stays hidden (INR-only mode)

While crypto deposit/withdrawal/wallet is globally disabled:

- **Deposit** screen offers **INR deposit only** (bank/UPI reference → admin
  approval). No crypto deposit address generation.
- **Withdraw** screen offers **INR manual payout only** (UPI / bank). No crypto
  withdrawal address entry, no on-chain send.
- **Transactions** history shows **INR deposits, INR withdrawals and executed
  trades** only. Crypto deposit/withdrawal history is not fetched or rendered.

## Feature gating

Screens read the effective feature map from `/auth/me` via `useAuth().features`
(`UserFeatureMap`). The map is `null` until `/auth/me` resolves — treated as
"unknown", **not** "enabled". Screens block **only** when the backend has
explicitly disabled a feature:

| Screen     | Gate                       |
|------------|----------------------------|
| Deposit    | `features.inrDeposit`      |
| Withdraw   | `features.inrWithdrawal`   |
| Trade      | `features.trading`         |

A blocked screen shows a locked `EmptyState`, not a fake form.

## Allowed static (non-financial) content

UI chrome only: labels, button titles, section headings, icons, theme colors,
helper/disclaimer copy, the staging badge, and method option labels (`UPI`,
`IMPS`, `NEFT`, `BANK`). None of these represent account or market values.

## Validation

From `mobile/`, these should return no fabricated-financial-data hits in
`src/` (matches are limited to UI labels, types, formatters, or this doc):

```
grep -rniE "fake|mock|dummy|sample|demoData|staticData" src
grep -rniE "₹\s*[0-9]|\b[0-9]+\.[0-9]+\s*(BTC|ETH|USDT)\b" src
```

Build / type safety:

```
npm run typecheck
npm run lint
```
