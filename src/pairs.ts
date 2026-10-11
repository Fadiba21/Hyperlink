import type { CoinGeckoCoin } from './coingecko';
import type { MarketTicker } from './exchanges/types';
import type { SignalRecord } from './signal';
import type { IconName } from './icons';

export type PairRow = { symbol: string; base: string; last: number; change24h: number; volume24h: number; image?: string; rank?: number; name?: string };
export type PairSort = 'volume' | 'gainers' | 'losers' | 'price' | 'name';
export type PairQuery = { category: string; query: string; sort: PairSort; favorites: string[]; calls: string[]; positions: string[]; members: Record<string, string[]> };
export type ChartLevel = { kind: 'entry' | 'sl' | 'tp'; label: string; price: number };
export type ChartPosition = { symbol: string; side: 'LONG' | 'SHORT'; entry: number; stopLoss?: number; takeProfits: number[]; label?: string };

export const baseTicker = (symbol: string): string => symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/PERP$/, '').replace(/(USDT|USDC|BUSD|USD)$/, '');
export const toPair = (raw: string): string => { const b = baseTicker(raw); return b ? `${b}USDT` : ''; };

/** 24h change as a fraction (0.05 = +5%). */
export function mergePairs(source: 'exchange' | 'coingecko', tickers: MarketTicker[], coins: CoinGeckoCoin[]): PairRow[] {
  const meta = new Map<string, CoinGeckoCoin>();
  for (const c of coins) { const prior = meta.get(c.symbol); if (!prior || (c.rank || 1e9) < (prior.rank || 1e9)) meta.set(c.symbol, c); }
  if (source === 'coingecko') {
    return coins.filter((c) => c.price > 0).map((c) => ({ symbol: `${c.symbol}USDT`, base: c.symbol, last: c.price, change24h: c.ch24h / 100, volume24h: c.volume24h, image: c.image, rank: c.rank || undefined, name: c.name }));
  }
  const seen = new Set<string>();
  const rows: PairRow[] = [];
  for (const t of tickers) {
    const base = baseTicker(t.symbol);
    const symbol = `${base}USDT`;
    if (!base || seen.has(symbol) || !(t.last > 0)) continue;
    seen.add(symbol);
    const m = meta.get(base);
    rows.push({ symbol, base, last: t.last, change24h: t.change24h, volume24h: t.volume24h || 0, image: m?.image, rank: m?.rank || undefined, name: m?.name });
  }
  return rows;
}

export function filterPairs(rows: PairRow[], q: PairQuery): PairRow[] {
  const term = baseTicker(q.query) || q.query.trim().toUpperCase();
  const fav = new Set(q.favorites.map(toPair));
  const calls = new Set(q.calls.map(toPair));
  const pos = new Set(q.positions.map(toPair));
  const members = q.members[q.category] ? new Set(q.members[q.category]) : null;
  let out = rows.filter((r) => {
    if (term && !r.base.includes(term) && !(r.name || '').toUpperCase().includes(q.query.trim().toUpperCase())) return false;
    if (term) return true; // searching spans every category
    switch (q.category) {
      case 'fav': return fav.has(r.symbol);
      case 'call': return calls.has(r.symbol);
      case 'pos': return pos.has(r.symbol);
      case 'gainers': return r.change24h > 0;
      case 'losers': return r.change24h < 0;
      case 'all': case 'hot': return true;
      default: return members ? members.has(r.base) : false;
    }
  });
  const sort: PairSort = q.category === 'gainers' ? 'gainers' : q.category === 'losers' ? 'losers' : q.sort;
  const by: Record<PairSort, (a: PairRow, b: PairRow) => number> = {
    volume: (a, b) => b.volume24h - a.volume24h,
    gainers: (a, b) => b.change24h - a.change24h,
    losers: (a, b) => a.change24h - b.change24h,
    price: (a, b) => b.last - a.last,
    name: (a, b) => a.base.localeCompare(b.base),
  };
  out = [...out].sort(by[sort]);
  if (q.category === 'hot') out = out.slice(0, 30);
  return out;
}

/** Entry / SL / TP guide lines for a symbol, from the latest call (and open positions). */
export function chartLevels(symbol: string, call?: Pick<SignalRecord, 'symbol' | 'direction' | 'entry' | 'stopLoss' | 'takeProfit' | 'takeProfits'> | null, positions: ChartPosition[] = []): ChartLevel[] {
  const out: ChartLevel[] = [];
  const key = toPair(symbol);
  if (call && toPair(call.symbol) === key) {
    out.push({ kind: 'entry', label: `Entry ${call.direction === 'LONG' ? '▲' : '▼'}`, price: call.entry });
    out.push({ kind: 'sl', label: 'SL', price: call.stopLoss });
    const tps = (call.takeProfits && call.takeProfits.length ? call.takeProfits : [call.takeProfit]).filter((n) => n > 0);
    tps.forEach((p, i) => out.push({ kind: 'tp', label: tps.length > 1 ? `TP${i + 1}` : 'TP', price: p }));
  }
  for (const p of positions) {
    if (toPair(p.symbol) !== key) continue;
    const tag = p.label || 'Posisi';
    out.push({ kind: 'entry', label: `${tag} ${p.side === 'LONG' ? '▲' : '▼'}`, price: p.entry });
    if (p.stopLoss) out.push({ kind: 'sl', label: `${tag} SL`, price: p.stopLoss });
    p.takeProfits.forEach((v, i) => out.push({ kind: 'tp', label: `${tag} TP${p.takeProfits.length > 1 ? i + 1 : ''}`, price: v }));
  }
  return out.filter((l) => Number.isFinite(l.price) && l.price > 0);
}

/** Levels close enough to the visible price range to be drawn (others only listed). */
export function visibleLevels(levels: ChartLevel[], low: number, high: number): { inside: ChartLevel[]; outside: ChartLevel[] } {
  const span = Math.max(high - low, 1e-12);
  const lo = low - span * 0.6; const hi = high + span * 0.6;
  return { inside: levels.filter((l) => l.price >= lo && l.price <= hi), outside: levels.filter((l) => l.price < lo || l.price > hi) };
}

export const sma = (values: number[], period: number): Array<number | null> => values.map((_, i) => (i + 1 < period ? null : values.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period));

export function ema(values: number[], period: number): Array<number | null> {
  const k = 2 / (period + 1); const out: Array<number | null> = [];
  let prev: number | null = null;
  values.forEach((v, i) => {
    if (i + 1 < period) { out.push(null); return; }
    prev = prev === null ? values.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period : v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}
/** Wilder's RSI (0–100); null until `period` changes are available. */
export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = values.map(() => null);
  if (values.length <= period) return out;
  let gain = 0; let loss = 0;
  for (let i = 1; i <= period; i += 1) { const d = values[i] - values[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  gain /= period; loss /= period;
  const calc = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[period] = calc();
  for (let i = period + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(0, d)) / period; loss = (loss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = calc();
  }
  return out;
}
/** Visible window for zoom/pan: `count` candles ending `offset` candles before the latest. */
export function windowRange(total: number, count: number, offset: number): { from: number; to: number } {
  const c = Math.max(10, Math.min(count, Math.max(10, total)));
  const off = Math.max(0, Math.min(offset, Math.max(0, total - c)));
  return { from: Math.max(0, total - c - off), to: total - off };
}

export const PAIR_CATEGORIES: Array<{ id: string; label: string; icon: IconName; cgId?: string }> = [
  { id: 'fav', label: 'Favorit', icon: 'star' },
  { id: 'call', label: 'Call', icon: 'signals' },
  { id: 'pos', label: 'Posisi', icon: 'wallet' },
  { id: 'hot', label: 'Populer', icon: 'bolt' },
  { id: 'all', label: 'Semua', icon: 'chart' },
  { id: 'gainers', label: 'Naik', icon: 'up' },
  { id: 'losers', label: 'Turun', icon: 'down' },
  { id: 'layer1', label: 'Layer 1', icon: 'layers', cgId: 'layer-1' },
  { id: 'layer2', label: 'Layer 2', icon: 'layers', cgId: 'layer-2' },
  { id: 'defi', label: 'DeFi', icon: 'coin', cgId: 'decentralized-finance-defi' },
  { id: 'meme', label: 'Meme', icon: 'trend', cgId: 'meme-token' },
  { id: 'ai', label: 'AI', icon: 'brain', cgId: 'artificial-intelligence' },
  { id: 'gaming', label: 'Gaming', icon: 'play', cgId: 'gaming' },
  { id: 'rwa', label: 'RWA', icon: 'shield', cgId: 'real-world-assets-rwa' },
  { id: 'stable', label: 'Stable', icon: 'coin', cgId: 'stablecoins' },
];
