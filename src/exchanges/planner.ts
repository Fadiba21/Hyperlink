import { floorToStep, roundToStep } from '../format';
import type { Exchange, ExchangeKeys, MarginMode, OrderPlan } from './types';

export type PlanInput = { symbol: string; side: 'Buy' | 'Sell'; takeProfit: number; stopLoss: number; leverage: number; marginMode: MarginMode; marginPct: number; available: number; entry: number; entryLow?: number; entryHigh?: number };
export type ManualPlanInput = { symbol: string; side: 'Buy' | 'Sell'; quantity: number; leverage: number; marginMode: MarginMode; stopLoss: number; takeProfit?: number; available: number };

/** Builds the exact signal-derived order from exchange rules and throws if the plan is unsafe. */
export async function planOrder(ex: Exchange, keys: ExchangeKeys, input: PlanInput): Promise<OrderPlan> {
  const [instrument, last] = await Promise.all([ex.instrument(keys.env, input.symbol), ex.lastPrice(keys.env, input.symbol)]);
  const leverage = Math.max(1, Math.min(input.leverage, instrument.maxLeverage || input.leverage));
  const warnings: string[] = [];
  if (leverage !== input.leverage) warnings.push(`Leverage diturunkan ke ${leverage}x (batas ${input.symbol} di ${ex.label}).`);
  const long = input.side === 'Buy';
  if ((long && (input.stopLoss >= last || input.takeProfit <= last)) || (!long && (input.stopLoss <= last || input.takeProfit >= last))) throw new Error(`Harga pasar ${last} sudah melewati SL/TP signal. Signal kedaluwarsa.`);
  const entryLow = Math.min(input.entryLow || input.entry, input.entryHigh || input.entry);
  const entryHigh = Math.max(input.entryLow || input.entry, input.entryHigh || input.entry);
  if (last < entryLow || last > entryHigh) throw new Error(`Harga ${last} belum masuk zona entry ${entryLow}–${entryHigh}. Order live tidak dikirim di luar rentang call.`);
  const drift = Math.abs(last - input.entry) / input.entry;
  if (entryLow === entryHigh && drift > 0.05) throw new Error(`Harga pasar menyimpang ${(drift * 100).toFixed(1)}% dari entry signal. Order dibatalkan.`);
  if (entryLow === entryHigh && drift > 0.01) warnings.push(`Harga pasar menyimpang ${(drift * 100).toFixed(1)}% dari entry signal.`);
  if (!(input.available > 0)) throw new Error('Saldo tersedia 0. Sinkronkan akun atau isi margin.');
  const pct = Math.max(1, Math.min(100, input.marginPct));
  const reserve = pct >= 95 ? 0.97 : 1;
  if (reserve < 1) warnings.push('Margin ≥95%: 3% saldo disisakan untuk fee.');
  const margin = input.available * (pct / 100) * reserve;
  let qty = floorToStep((margin * leverage) / last, instrument.qtyStep);
  if (Number(qty) > Number(instrument.maxQty)) qty = floorToStep(Number(instrument.maxQty), instrument.qtyStep);
  if (!(Number(qty) > 0) || Number(qty) < Number(instrument.minQty) || Number(qty) * last < instrument.minNotional) {
    throw new Error(`Margin terlalu kecil: qty ${qty} di bawah minimum ${instrument.minQty} (min nilai ${instrument.minNotional} USDT). Naikkan margin %.`);
  }
  const notional = Number(qty) * last;
  if (entryLow !== entryHigh) warnings.push(`Harga pasar berada di dalam zona entry call (${entryLow}–${entryHigh}).`);
  const stopLoss = roundToStep(input.stopLoss, instrument.tickSize);
  const takeProfit = roundToStep(input.takeProfit, instrument.tickSize);
  return { exchange: ex.id, symbol: input.symbol, side: input.side, qty, leverage, marginMode: input.marginMode, takeProfit, stopLoss, lastPrice: last, notional, margin: notional / leverage, maxLoss: Math.abs(last - Number(stopLoss)) * Number(qty), warnings };
}

/** Manual Live entry planner; requires current instrument rules, an exchange quote and a protective SL. */
export async function planManualOrder(ex: Exchange, keys: ExchangeKeys, input: ManualPlanInput): Promise<OrderPlan> {
  const [instrument, last] = await Promise.all([ex.instrument(keys.env, input.symbol), ex.lastPrice(keys.env, input.symbol)]);
  if (!(last > 0) || !Number.isFinite(last)) throw new Error(`Harga market ${input.symbol} dari ${ex.label} tidak valid.`);
  const long = input.side === 'Buy';
  const leverage = Math.max(1, Math.min(Math.floor(input.leverage), instrument.maxLeverage || input.leverage));
  const warnings: string[] = [];
  if (leverage !== input.leverage) warnings.push(`Leverage dibatasi menjadi ${leverage}x, yaitu batas aktual ${input.symbol} di ${ex.label}.`);
  if (!(input.available > 0)) throw new Error('Saldo tersedia 0. Sinkronkan akun Live sebelum order manual.');
  const rawStop = Number(input.stopLoss);
  if (!(rawStop > 0) || !Number.isFinite(rawStop)) throw new Error('Stop Loss wajib diisi untuk order Live manual.');
  if ((long && rawStop >= last) || (!long && rawStop <= last)) throw new Error(`Stop Loss harus ${long ? 'di bawah' : 'di atas'} harga pasar ${last}.`);
  const rawTake = input.takeProfit === undefined ? 0 : Number(input.takeProfit);
  if (rawTake < 0 || !Number.isFinite(rawTake)) throw new Error('Take Profit harus berupa harga positif atau kosong.');
  if (rawTake > 0 && ((long && rawTake <= last) || (!long && rawTake >= last))) throw new Error(`Take Profit harus ${long ? 'di atas' : 'di bawah'} harga pasar ${last}.`);
  if (Math.abs(last - rawStop) / last * leverage >= 0.9) throw new Error('Jarak Stop Loss × leverage ≥ 90% margin; ukuran ini berisiko likuidasi sebelum SL. Turunkan leverage atau pilih SL yang lebih dekat.');
  const requestedQty = Number(input.quantity);
  if (!(requestedQty > 0) || !Number.isFinite(requestedQty)) throw new Error('Qty harus berupa angka positif.');
  const qty = floorToStep(requestedQty, instrument.qtyStep);
  if (!(Number(qty) > 0) || Number(qty) < Number(instrument.minQty)) throw new Error(`Qty ${qty} di bawah minimum pair ${instrument.minQty} ${input.symbol}.`);
  if (Number(qty) > Number(instrument.maxQty)) throw new Error(`Qty ${qty} melewati maksimum pair ${instrument.maxQty} ${input.symbol}.`);
  const notional = Number(qty) * last;
  if (notional < instrument.minNotional) throw new Error(`Nilai order ${notional.toFixed(4)} USDT di bawah minimum ${instrument.minNotional} USDT untuk ${input.symbol}.`);
  const margin = notional / leverage;
  if (margin > input.available * 0.97) throw new Error(`Margin estimasi ${margin.toFixed(2)} USDT melebihi saldo tersedia setelah cadangan fee (${(input.available * 0.97).toFixed(2)} USDT).`);
  if (Number(qty) < requestedQty) warnings.push(`Qty dibulatkan turun mengikuti step pair ${instrument.qtyStep}.`);
  if (!(rawTake > 0)) warnings.push('Tidak ada Take Profit: hanya Stop Loss native yang akan dipasang.');
  const stopLoss = roundToStep(rawStop, instrument.tickSize);
  const takeProfit = rawTake > 0 ? roundToStep(rawTake, instrument.tickSize) : '0';
  if ((long && Number(stopLoss) >= last) || (!long && Number(stopLoss) <= last)) throw new Error('Stop Loss berada terlalu dekat dan pembulatan tick mengubah arahnya. Atur level kembali.');
  if (rawTake > 0 && ((long && Number(takeProfit) <= last) || (!long && Number(takeProfit) >= last))) throw new Error('Take Profit berada terlalu dekat dan pembulatan tick mengubah arahnya. Atur level kembali.');
  return { exchange: ex.id, symbol: input.symbol, side: input.side, qty, leverage, marginMode: input.marginMode, takeProfit, stopLoss, lastPrice: last, notional, margin, maxLoss: Math.abs(last - Number(stopLoss)) * Number(qty), warnings };
}
