import type { Candle, MarginMode } from './domain';
import type { Signal, SimResult } from './signal';

/** Replays a call against candles: waits for entry, then which of SL/TP/liquidation comes first. Within one candle SL wins (conservative). */
export function simulateCall(s: Signal, candles: Candle[], callTime: number, opts: { marginPct: number; marginMode: MarginMode; maxWaitMs?: number }, now = Date.now()): SimResult {
  const long = s.direction === 'LONG';
  const wait = opts.maxWaitMs ?? 24 * 3600000;
  const liq = long ? s.entry * (1 - 1 / s.leverage + 0.005) : s.entry * (1 + 1 / s.leverage - 0.005);
  let entryAt: number | undefined;
  for (const c of candles) {
    if (c.t < callTime - 1) continue;
    if (!entryAt) {
      if (c.l <= s.entry && c.h >= s.entry) entryAt = c.t;
      else if ((long && (c.h >= s.takeProfit || c.l <= s.stopLoss)) || (!long && (c.l <= s.takeProfit || c.h >= s.stopLoss)) || c.t - callTime > wait) return { outcome: 'noentry', at: now };
      if (!entryAt) continue;
    }
    const hitSl = long ? c.l <= s.stopLoss : c.h >= s.stopLoss;
    const hitTp = long ? c.h >= s.takeProfit : c.l <= s.takeProfit;
    const hitLiq = opts.marginMode === 'Isolated' && (long ? c.l <= liq : c.h >= liq);
    const done = (outcome: SimResult['outcome'], exit: number): SimResult => {
      const move = (long ? exit - s.entry : s.entry - exit) / s.entry;
      const roi = Math.max(-1, move * s.leverage);
      return { outcome, entryAt, exitAt: c.t, entryPrice: s.entry, exitPrice: exit, roiPct: roi * 100, pnlPct: roi * opts.marginPct, at: now };
    };
    if (hitLiq && (long ? liq >= s.stopLoss : liq <= s.stopLoss)) return done('liquidated', liq);
    if (hitSl) return done('SL', s.stopLoss);
    if (hitTp) return done('TP', s.takeProfit);
  }
  if (!entryAt) return { outcome: 'noentry', at: now };
  const last = candles[candles.length - 1].c;
  const move = (long ? last - s.entry : s.entry - last) / s.entry;
  return { outcome: 'open', entryAt, entryPrice: s.entry, exitPrice: last, roiPct: move * s.leverage * 100, pnlPct: move * s.leverage * opts.marginPct, at: now };
}
