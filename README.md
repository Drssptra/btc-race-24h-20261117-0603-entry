# btc-race-24h-20261117-0603-entry

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Drssptra/btc-race-24h-20261117-0603-entry/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Drssptra/btc-race-24h-20261117-0603-entry/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute,
on replayed on-chain prices, for the [make.fun](https://make.fun/bounty/btc-race-24h-20261117-0603)
competition "Race a BTC trading bot live for 24 hours" (`bars-replay/v1`).

## Run it

```sh
node /bot/main.ts
```

## Strategy

On a 24-hour window of 1-minute bars, BTC mostly oscillates around its
recent average instead of trending. The bot buys only when the asset is
statistically cheap against its own 4-hour average, sells when it has
reverted above that average, and cuts the position with a hard stop-loss
if the dip keeps falling. One position at a time, long only, full size,
a handful of trades per day.

- **SMA**: simple moving average of the last 240 one-minute closes (4 hours).
- **Buy** (when flat): latest close at least **80 bps below** the SMA.
- **Sell** (when long): latest close at least **60 bps above** the SMA, or
  at least **150 bps below** the entry fill price (hard stop-loss).
- **Sizing**: a buy spends all available cash; a sell sells the whole
  position. `max_slippage_bps` is 300 — wide enough that a normal 1-minute
  gap never rejects an order, tight enough to block a disaster fill.

Each full-size round trip costs roughly 26–37 bps in fees, slippage and
pool impact, so the bands are set wide enough that a completed round trip
has to earn more than it costs. All comparisons are exact integer
arithmetic — no floats, no wall clock, no randomness — so the run is
fully deterministic (the grader's two executions reproduce byte for byte).

## Results on the dev window

Graded locally with the kit (`grade-local --driver process`):

- **Net PnL: +14.32 USDC** on $1,000 starting capital (return +1.43%)
- 4 trades, win rate 1.00, max drawdown 0.72%, 0 rejected orders
- Guardrails met; dev gate (net PnL > 0) passed, so the bot races

The same rule stays profitable across the neighbouring parameter choices
(buy band 60–100 bps, sell band 40–80 bps, SMA lookback 120–360 bars)
and profited in both halves of the dev window, so the edge is not one
lucky trade.

## Layout

- `main.ts` — the bot (Node 22, `node /bot/main.ts`)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's SDK shim

---

<sub>Entered on [make.fun](https://make.fun/?ref=hyz23m3g&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
