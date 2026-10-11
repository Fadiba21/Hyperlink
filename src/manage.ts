import type { Position, TpSl } from './exchanges/types';
import { floorToStep, roundToStep } from './format';

/** Validates new TP/SL against the live mark price; returns an error message or null. */
export function validateTpSl(side: Position['side'], mark: number, current: { stopLoss?: number; takeProfit?: number }, next: { stopLoss?: number | null; takeProfit?: number | null }): string | null {
  if (!(mark > 0)) return 'Harga mark belum tersedia. Sinkronkan dulu.';
  const sl = next.stopLoss === undefined ? current.stopLoss : next.stopLoss || undefined;
  const tp = next.takeProfit === undefined ? current.takeProfit : next.takeProfit || undefined;
  if (sl !== undefined && (!Number.isFinite(sl) || sl <= 0)) return 'Stop loss tidak valid.';
  if (tp !== undefined && (!Number.isFinite(tp) || tp <= 0)) return 'Take profit tidak valid.';
  const long = side === 'LONG';
  if (sl !== undefined && (long ? sl >= mark : sl <= mark)) return long ? `SL LONG harus di bawah harga mark (${mark}).` : `SL SHORT harus di atas harga mark (${mark}).`;
  if (tp !== undefined && (long ? tp <= mark : tp >= mark)) return long ? `TP LONG harus di atas harga mark (${mark}).` : `TP SHORT harus di bawah harga mark (${mark}).`;
  return null;
}

/** Parses user text into a TpSl patch: '' keeps, '0' removes, number rounds to tick. */
export function toTpSl(input: { stopLoss: string; takeProfit: string }, tick: string): TpSl {
  const conv = (v: string) => { const t = v.trim().replace(',', '.'); if (!t) return undefined; const n = Number(t); return n === 0 ? '0' : roundToStep(n, tick); };
  return { stopLoss: conv(input.stopLoss), takeProfit: conv(input.takeProfit) };
}

/** Quantity to close for a percentage; undefined means "whole position". */
export function closeQty(size: string, pct: number, qtyStep: string): string | undefined {
  if (pct >= 100) return undefined;
  const q = floorToStep((Number(size) * pct) / 100, qtyStep);
  if (!(Number(q) > 0)) throw new Error('Ukuran tutup parsial di bawah minimum. Gunakan 100%.');
  return q;
}
