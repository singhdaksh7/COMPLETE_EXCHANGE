# TradingView Advanced Charts — Datafeed mapping

**Status: readiness only.** The TradingView Advanced Charts library is
licensed and is **not** in this repository. Nothing here imports or copies
TradingView proprietary code. This documents the exact mapping the operator's
authorized `charting_library` package will plug into once supplied, and
`frontend/lib/tradingview/datafeed-adapter.ts` implements EXORA's side of it
today (self-contained, unused until the library exists — see that file's
header comment).

## Symbol scope

Only the 4 registry symbols are ever offered: `BTCUSDT`, `ETHUSDT`,
`BNBUSDT`, `USDTINR`. Source: `backend/src/modules/market-data/symbol-registry.ts`.

## Method mapping

| TradingView Datafeed method | EXORA implementation |
|---|---|
| `onReady` | Returns static config (`supported_resolutions`, one synthetic `EXORA` exchange). No network call. |
| `searchSymbols` | `GET /market-data` (symbol registry), filtered client-side — only 4 symbols exist, no server-side search needed. |
| `resolveSymbol` | `GET /market-data` (symbol registry), looked up by symbol. `pricescale = 10^pricePrecision` from the registry metadata. |
| `getBars` | `GET /market-data/:symbol/candles?resolution=&limit=` — ascending, deduplicated bars (Goal 7). `resolution` strings (`1`,`5`,`15`,`30`,`60`,`240`,`1D`) are identical between EXORA and TradingView by construction, so no translation table is needed. |
| `subscribeBars` | Existing Socket.IO connection (`frontend/lib/socket.ts`), `md:subscribe` event, listening for `candle` events server-pushed to the `md:{SYMBOL}` room (Goal 9). |
| `unsubscribeBars` | `md:unsubscribe` — only sent once no other chart listener still needs that symbol. |

## Resolutions

`1`, `5`, `15`, `30`, `60`, `240`, `1D` — chosen in Goal 2/7 specifically so
no resolution-string translation layer is needed against TradingView.

## What is intentionally NOT implemented

- `getMarks` / `getTimescaleMarks` / `getServerTime` — not required for a
  price-only chart; add only if the operator's TradingView license needs them.
- Any Binance/CoinGecko-specific symbol or resolution leaks into the
  datafeed — the adapter only ever talks to EXORA's own `/market-data` API
  and realtime stream, per the "no raw provider payload" boundary.

## Wiring it up (future step, once the library is supplied)

1. Add the operator-provided `charting_library` package/static assets.
2. Replace the local `DatafeedConfiguration` / `LibrarySymbolInfo` / `Bar`
   types in `datafeed-adapter.ts` with the library's real types.
3. Pass `exoraDatafeed` as the `datafeed` option to `TradingView.widget(...)`.
4. No changes are expected on the EXORA API/stream side — the adapter was
   written against the final REST/realtime contracts already shipped in this
   stage.
