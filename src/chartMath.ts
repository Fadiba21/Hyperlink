import type { Candle } from './domain';

/** Round-number axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count < 2) return [];
  if (max <= min) return [min];
  const span = max - min;
  const rough = span / (count - 1);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const f = rough / pow;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Bollinger bands: middle SMA and ±k·σ. Entries are null until `period` values exist. */
export function bollinger(values: number[], period = 20, k = 2): Array<{ mid: number; up: number; lo: number } | null> {
  return values.map((_, i) => {
    if (i + 1 < period) return null;
    const w = values.slice(i + 1 - period, i + 1);
    const mid = w.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mid) ** 2, 0) / period);
    return { mid, up: mid + k * sd, lo: mid - k * sd };
  });
}

const emaSeries = (values: number[], period: number): number[] => {
  const k = 2 / (period + 1); const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
};

/** MACD (12, 26, 9): macd line, signal line, histogram. First `slow-1` entries are null. */
export function macd(values: number[], fast = 12, slow = 26, signal = 9): Array<{ macd: number; signal: number; hist: number } | null> {
  if (!values.length) return [];
  const f = emaSeries(values, fast); const s = emaSeries(values, slow);
  const line = values.map((_, i) => f[i] - s[i]);
  const start = slow - 1;
  const sig = emaSeries(line.slice(start), signal);
  return values.map((_, i) => (i < start ? null : { macd: line[i], signal: sig[i - start], hist: line[i] - sig[i - start] }));
}

/** Cumulative volume-weighted average price over the series (needs candle volume). */
export function vwap(candles: Candle[]): Array<number | null> {
  let pv = 0; let vol = 0;
  return candles.map((c) => {
    const v = c.v || 0;
    if (!(v > 0)) return vol > 0 ? pv / vol : null;
    pv += ((c.h + c.l + c.c) / 3) * v; vol += v;
    return pv / vol;
  });
}

/** New pan offset (candles back from latest) after dragging `dx` px; dragging right reveals older candles. */
export function panOffset(startOffset: number, dx: number, step: number, total: number, count: number): number {
  if (!(step > 0)) return startOffset;
  const next = Math.round(startOffset + dx / step);
  return Math.max(0, Math.min(Math.max(0, total - count), next));
}

/** New visible-candle count for a pinch (`scale` > 1 spreads fingers = zoom in = fewer candles). */
export function pinchCount(startCount: number, scale: number, total: number, minCount = 12, maxCount = 400): number {
  if (!(scale > 0) || !Number.isFinite(scale)) return startCount;
  return Math.max(minCount, Math.min(Math.min(maxCount, Math.max(minCount, total)), Math.round(startCount / scale)));
}

export const touchDistance = (a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }): number => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

/** Compact axis time label depending on how much time the whole window spans. */
export function timeLabel(t: number, spanMs: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  if (spanMs <= 2 * 86400000) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (spanMs <= 120 * 86400000) return `${d.getDate()} ${months[d.getMonth()]}`;
  return `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

/** Summary of a candle window: high, low, change %, and total volume when available. */
export function windowStats(candles: Candle[]): { high: number; low: number; changePct: number; volume: number } | null {
  if (!candles.length) return null;
  const high = Math.max(...candles.map((c) => c.h)); const low = Math.min(...candles.map((c) => c.l));
  const first = candles[0].o; const last = candles[candles.length - 1].c;
  return { high, low, changePct: first > 0 ? ((last - first) / first) * 100 : 0, volume: candles.reduce((a, c) => a + (c.v || 0), 0) };
}
