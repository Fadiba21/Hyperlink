import type { MarginAdvice } from './advice';
import type { MarginMode } from './domain';
export type Signal = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  entryLow?: number;
  entryHigh?: number;
  stopLoss: number;
  takeProfit: number;
  takeProfits?: number[];
  leverage: number;
  confidence: number;
  rationale: string;
  advice?: MarginAdvice;
};

export type SimResult = { outcome: 'TP' | 'SL' | 'open' | 'noentry' | 'liquidated'; entryAt?: number; exitAt?: number; entryPrice?: number; exitPrice?: number; roiPct?: number; pnlPct?: number; at: number };
export type SignalStatus = 'ready' | 'executed' | 'failed' | 'dismissed';
export type SignalRecord = Signal & {
  id: string;
  source: string;
  text: string;
  createdAt: number;
  callTime?: number;
  status: SignalStatus;
  orderId?: string;
  note?: string;
  marginPct?: number;
  marginMode?: MarginMode;
  sim?: SimResult;
};
export type StreamMessage = { id: string; chatId: number; chatTitle: string; text: string; createdAt: number; result: 'pending' | 'accepted' | 'rejected' | 'skipped'; reason?: string };

export function normalizeSymbol(raw: string): string {
  let s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return '';
  if (s.endsWith('USDT.P')) s = s.slice(0, -2);
  if (!s.endsWith('USDT') && !s.endsWith('USDC')) s += 'USDT';
  return s;
}

export function entryRange(s: Pick<Signal, 'entry' | 'entryLow' | 'entryHigh'>): { low: number; high: number } {
  const a = Number(s.entryLow) > 0 ? Number(s.entryLow) : s.entry;
  const b = Number(s.entryHigh) > 0 ? Number(s.entryHigh) : s.entry;
  return { low: Math.min(a, b), high: Math.max(a, b) };
}

export function takeProfitLevels(s: Pick<Signal, 'takeProfit' | 'takeProfits'>): number[] {
  const levels = (s.takeProfits || []).filter((n) => Number.isFinite(n) && n > 0);
  return levels.length ? levels : [s.takeProfit];
}

/** Returns an error message when a signal is unsafe/inconsistent, otherwise null. */
export function validateSignal(s: Signal): string | null {
  if (!/^[A-Z0-9]{2,20}USDT$/.test(s.symbol)) return 'Symbol harus pair USDT perpetual (mis. BTCUSDT).';
  if (s.direction !== 'LONG' && s.direction !== 'SHORT') return 'Arah signal tidak jelas.';
  const band = entryRange(s);
  const targets = takeProfitLevels(s);
  const values: Array<[string, number]> = [['entry', s.entry], ['batas bawah entry', band.low], ['batas atas entry', band.high], ['stop loss', s.stopLoss], ...targets.map((v, i): [string, number] => [`take profit ${i + 1}`, v])];
  for (const [key, value] of values) if (!Number.isFinite(value) || value <= 0) return `Nilai ${key} tidak valid.`;
  if (s.entry < band.low || s.entry > band.high) return 'Harga entry harus berada di dalam zona entry.';
  if (!Number.isInteger(s.leverage) || s.leverage < 1 || s.leverage > 100) return 'Leverage harus 1–100x.';
  if (s.direction === 'LONG' && !(s.stopLoss < band.low && targets.every((tp, i) => tp > band.high && (i === 0 || tp > targets[i - 1])))) return 'LONG: SL harus di bawah zona entry dan semua TP harus berurutan di atasnya.';
  if (s.direction === 'SHORT' && !(s.stopLoss > band.high && targets.every((tp, i) => tp < band.low && (i === 0 || tp < targets[i - 1])))) return 'SHORT: SL harus di atas zona entry dan semua TP harus berurutan di bawahnya.';
  const riskReference = s.direction === 'LONG' ? band.low : band.high;
  const slDistance = Math.abs(riskReference - s.stopLoss) / riskReference;
  if (slDistance * s.leverage >= 0.9) return 'Jarak SL × leverage ≥ 90% margin: posisi bisa terlikuidasi sebelum SL.';
  return null;
}

export function riskReward(s: Signal): number {
  const band = entryRange(s);
  const reference = s.direction === 'LONG' ? band.low : band.high;
  const risk = Math.abs(reference - s.stopLoss);
  const reward = Math.abs(takeProfitLevels(s)[0] - reference);
  return risk > 0 ? reward / risk : 0;
}

/** Reads common Telegram call layouts, including entry zones and multiple targets. */
export function parseTelegramCall(text: string): Signal | null {
  const symbolMatch = text.match(/#?\s*([A-Z0-9]{2,20})\s*\/\s*(USDT|USDC)\b|#?\b([A-Z0-9]{2,20})(USDT|USDC)\b/i);
  const rawSymbol = symbolMatch ? `${symbolMatch[1] || symbolMatch[3]}${symbolMatch[2] || symbolMatch[4]}` : '';
  const directionMatch = text.match(/(?:^|\n)\s*[^\w\r\n]{0,4}\s*(LONG|SHORT)\b/i) || text.match(/(?:^|\n)\s*(?:direction|side)\s*:\s*(LONG|SHORT|BUY|SELL)\b/i);
  const directionText = directionMatch?.[1]?.toUpperCase();
  const direction = directionText === 'SHORT' || directionText === 'SELL' ? 'SHORT' : directionText === 'LONG' || directionText === 'BUY' ? 'LONG' : null;
  const entryMatch = text.match(/(?:^|\n)\s*[^\w\r\n]{0,5}\s*(?:buy|entry(?:\s*(?:price|zone|range))?|entry point)\s*[:=]\s*([\d.,]+)(?:\s*(?:-|–|to)\s*([\d.,]+))?/i);
  const slMatch = text.match(/(?:^|\n)\s*[^\w\r\n]{0,5}\s*(?:stop\s*loss|stoploss|sl)\s*[:=]\s*([\d.,]+)/i);
  const leverageMatch = text.match(/\bleverage\s*[:=]?\s*(\d{1,3})\s*x?\b/i);
  if (!rawSymbol || !direction || !entryMatch || !slMatch) return null;
  const number = (v: string | undefined) => v === undefined ? NaN : Number(v.replace(',', '.'));
  const entryValues = [number(entryMatch[1]), number(entryMatch[2])].filter((n) => Number.isFinite(n) && n > 0);
  const tpMatches = Array.from(text.matchAll(/(?:^|\n)\s*[^\w\r\n]{0,5}\s*(?:targets?|take\s*profits?|tp\d*)\s*[:=]\s*([^\n]+)/gi));
  const targets = tpMatches.flatMap((m) => (m[1].match(/[\d]+(?:[.,][\d]+)?/g) || []).map(number)).filter((n) => Number.isFinite(n) && n > 0);
  const uniqueTargets = Array.from(new Set(targets));
  if (!uniqueTargets.length || entryValues.length === 0) return null;
  const low = Math.min(...entryValues); const high = Math.max(...entryValues);
  const entry = (low + high) / 2;
  const orderedTargets = uniqueTargets.sort((a, b) => direction === 'LONG' ? a - b : b - a);
  return {
    symbol: normalizeSymbol(rawSymbol), direction, entry, entryLow: low, entryHigh: high,
    stopLoss: number(slMatch[1]), takeProfit: orderedTargets[0], takeProfits: orderedTargets,
    leverage: Number(leverageMatch?.[1]) || 5, confidence: 0.99,
    rationale: 'Call Telegram dikenali langsung: zona entry dan seluruh target TP dibaca dari teks.',
  };
}

/** Cheap pre-filter so we do not spend Gemini calls on chit-chat. */
export function looksLikeCall(text: string): boolean {
  if (text.length < 15) return false;
  const numbers = text.match(/\d+(?:[.,]\d+)?/g) || [];
  return numbers.length >= 3;
}
