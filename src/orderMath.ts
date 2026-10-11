/** Pure helpers for the manual-order card (sizing, TP/SL by ROI, summary figures). */
export type Side = 'Buy' | 'Sell';

export function roundDown(value: number, step: number): number {
  if (!(value > 0)) return 0;
  if (!(step > 0)) return value;
  const decimals = Math.min(10, (String(step).split('.')[1] || '').length);
  return Number((Math.floor(value / step + 1e-9) * step).toFixed(decimals));
}

/** Quantity for margin = pct% of the available balance at the given leverage. */
export function qtyForAllocation(available: number, pct: number, leverage: number, price: number, step = 0): number {
  if (!(available > 0) || !(price > 0) || !(leverage > 0) || !(pct > 0)) return 0;
  return roundDown((available * (Math.min(100, pct) / 100) * leverage) / price, step);
}

/** Price at which the position reaches `roiPct`% return on margin (profit when kind='tp', loss when 'sl'). */
export function levelFromRoi(entry: number, side: Side, leverage: number, roiPct: number, kind: 'tp' | 'sl'): number {
  if (!(entry > 0) || !(leverage > 0) || !(roiPct > 0)) return 0;
  const move = roiPct / 100 / leverage;
  const up = (side === 'Buy') === (kind === 'tp');
  return entry * (up ? 1 + move : 1 - move);
}

/** Return on margin (%) if price goes from entry to `level`; negative = loss. */
export function roiAt(entry: number, side: Side, leverage: number, level: number): number {
  if (!(entry > 0) || !(level > 0)) return 0;
  const move = (level - entry) / entry;
  return move * leverage * (side === 'Buy' ? 1 : -1) * 100;
}

export type Summary = { notional: number; margin: number; fee: number; liq: number; maxLoss: number | null; maxProfit: number | null; rr: number | null };

/** Approximate isolated liquidation (maintenance margin ~0.5%). Real values come from the exchange. */
export function approxLiq(entry: number, side: Side, leverage: number, mmr = 0.005): number {
  if (!(entry > 0) || !(leverage > 0)) return 0;
  const d = Math.max(0.0005, 1 / leverage - mmr);
  return side === 'Buy' ? entry * (1 - d) : entry * (1 + d);
}

export function summarize(o: { entry: number; qty: number; leverage: number; side: Side; sl?: number; tp?: number; feeRate?: number }): Summary {
  const { entry, qty, leverage, side } = o;
  const notional = entry > 0 && qty > 0 ? entry * qty : 0;
  const dir = side === 'Buy' ? 1 : -1;
  const maxLoss = o.sl && o.sl > 0 && notional > 0 ? Math.max(0, (entry - o.sl) * dir * qty) : null;
  const maxProfit = o.tp && o.tp > 0 && notional > 0 ? Math.max(0, (o.tp - entry) * dir * qty) : null;
  return {
    notional, margin: leverage > 0 ? notional / leverage : 0, fee: notional * (o.feeRate ?? 0.0006), liq: approxLiq(entry, side, leverage),
    maxLoss, maxProfit, rr: maxLoss && maxProfit ? maxProfit / maxLoss : null,
  };
}
