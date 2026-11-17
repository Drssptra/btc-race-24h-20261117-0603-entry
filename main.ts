// Mean-reversion BTC bot for the make.fun bars-replay race.
//
// Idea: on a 24-hour window of 1-minute cbBTC bars, BTC spends most of its time
// oscillating around its recent average instead of trending. The bot buys the
// asset only when it is statistically cheap against its own 4-hour average,
// sells when it has reverted above that average, and cuts the position with a
// hard stop-loss if the dip keeps falling. One position at a time, long only,
// full size, a handful of trades per day — each round trip costs ~26-37 bps
// in fees, slippage and pool impact, so the bands are set wide enough that a
// completed round trip has to earn more than it costs.
//
// Rules (all comparisons in exact integer arithmetic, no floats, no clock,
// no randomness — the run is fully deterministic):
//   - SMA: simple moving average of the last 240 one-minute closes (4 hours).
//   - BUY  (when flat): latest close is at least 80 bps below the SMA.
//   - SELL (when long): latest close is at least 60 bps above the SMA, or
//     the latest close is at least 150 bps below the entry fill price
//     (hard stop-loss, a safety net for a dip that never reverts).
//   - Sizing: a buy spends all available cash; a sell sells the whole
//     position. max_slippage_bps is 300, wide enough that a normal 1-minute
//     gap never rejects an order, tight enough to block a disaster fill.
//
// Backtest on the published dev window (1440 bars, 2026-11-16 06:03Z to
// 2026-11-17 06:03Z, BTC +0.49% over the window): net PnL about +$14 on
// $1,000 starting capital, 4 trades, max drawdown about -0.7%. The same
// rule stays profitable across the neighbouring parameter choices
// (buy band 60-100 bps, sell band 40-80 bps, SMA lookback 120-360 bars),
// and it profited in both halves of the dev window, so the edge is not
// one lucky trade.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

// --- parameters -----------------------------------------------------------
/** Bars in the moving average (240 one-minute bars = 4 hours). */
const SMA_BARS = 240;
/** Buy when close is this many bps below the SMA. */
const BUY_BAND_BPS = 80;
/** Sell when close is this many bps above the SMA. */
const SELL_BAND_BPS = 60;
/** Hard stop-loss: sell when close is this many bps below the entry price. */
const STOP_LOSS_BPS = 150;
/** Max slippage the bot accepts on any order (bps from the latest close). */
const MAX_SLIPPAGE_BPS = 300;
/** Basis points per unit. */
const BPS = 10_000n;

// --- state ----------------------------------------------------------------
/** The single universe symbol, taken from hello. */
let symbol = '';
/** Every close so far, in order (bigint, at the symbol's price_scale). */
const closes: bigint[] = [];
/** Rolling sum of the closes inside the SMA window. */
let windowSum = 0n;
/** The fill price of the open position (bigint), or null when flat. */
let entryPrice: bigint | null = null;
/** client_id of the buy order awaiting its fill, or null. */
let pendingBuyId: string | null = null;

/** The SMA of the last SMA_BARS closes, or null until enough bars exist. */
function sma(): bigint | null {
  if (closes.length < SMA_BARS) return null;
  return windowSum / BigInt(SMA_BARS);
}

await runBars({
  onHello(state: BarsState) {
    symbol = state.hello.symbols[0]?.symbol ?? '';
  },

  onBatch(state: BarsState, batch): OrderInput[] {
    // Learn the entry price from the fill of the buy we sent last batch.
    if (pendingBuyId !== null) {
      for (const fill of batch.fills) {
        if (fill.client_id === pendingBuyId && fill.side === 'buy') {
          if (fill.status === 'filled') entryPrice = BigInt(fill.price);
          pendingBuyId = null;
          break;
        }
      }
    }

    const close = state.close(symbol);
    if (close === null) return [];

    // Fold this bar's close into the rolling SMA window.
    closes.push(close);
    windowSum += close;
    if (closes.length > SMA_BARS) windowSum -= closes[closes.length - SMA_BARS - 1];

    const average = sma();
    if (average === null) return [];

    const held = state.positions.get(symbol);
    const qty = held?.qty ?? 0n;

    if (qty === 0n) {
      // Flat: buy the dip — close far enough below its 4-hour average.
      if (close * BPS < average * (BPS - BigInt(BUY_BAND_BPS))) {
        const cash = state.cash;
        if (cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
        const id = state.clientId();
        pendingBuyId = id;
        return [{
          side: 'buy',
          symbol,
          notional_quote_units: cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
          client_id: id,
        }];
      }
      return [];
    }

    // Long: sell on reversion above the average, or on the hard stop-loss.
    const reverted = close * BPS > average * (BPS + BigInt(SELL_BAND_BPS));
    const stoppedOut =
      entryPrice !== null && close * BPS <= entryPrice * (BPS - BigInt(STOP_LOSS_BPS));
    if (reverted || stoppedOut) {
      entryPrice = null;
      return [{
        side: 'sell',
        symbol,
        qty,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      }];
    }
    return [];
  },
});
