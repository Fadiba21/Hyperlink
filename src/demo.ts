import { floorToStep } from './format';
import type { MarginMode } from './domain';

export type DemoSide = 'LONG' | 'SHORT';
export type DemoPosition = { id: string; symbol: string; side: DemoSide; size: number; entry: number; leverage: number; margin: number; openedAt: number; takeProfit?: number; takeProfits?: number[]; hitTakeProfits?: number[]; stopLoss?: number; source?: string; marginMode?: MarginMode };
export type DemoClosed = { id: string; symbol: string; side: DemoSide; pnl: number; reason: string; closedAt: number; source?: string; margin?: number; entry?: number; exit?: number };
export type DemoOrder = { id: string; symbol: string; side: DemoSide; entry: number; leverage: number; marginPct: number; marginMode: MarginMode; takeProfit?: number; takeProfits?: number[]; stopLoss?: number; qty?: number; orderType?: 'limit' | 'signal'; source?: string; createdAt: number; expiresAt: number; waitFor: 'up' | 'down' };
export type DemoState = { balance: number; positions: DemoPosition[]; closed: DemoClosed[]; orders: DemoOrder[] };
export type DemoEvent = { position: DemoPosition; reason: string; pnl: number };
export type OrderEvent = { order: DemoOrder; kind: 'filled' | 'cancelled' | 'expired' | 'rejected'; reason: string };

export const DEMO_START = 10000;
export const ORDER_TTL_MS = 24 * 3600000;
const MMR = 0.005;
export const initialDemo = (): DemoState => ({ balance: DEMO_START, positions: [], closed: [], orders: [] });
export const normalizeDemo = (d: Partial<DemoState> | undefined): DemoState => ({ ...initialDemo(), ...(d || {}), orders: Array.isArray(d?.orders) ? d!.orders! : [], positions: Array.isArray(d?.positions) ? d!.positions! : [], closed: Array.isArray(d?.closed) ? d!.closed! : [] });

export const pnlOf = (p: DemoPosition, price: number): number => (price - p.entry) * p.size * (p.side === 'LONG' ? 1 : -1);
export const demoEquity = (s: DemoState, prices: Record<string, number>): number => s.balance + s.positions.reduce((sum, p) => sum + p.margin + pnlOf(p, prices[p.symbol] || p.entry), 0);

export function qtyStepFor(price: number): number { return price >= 1000 ? 0.001 : price >= 100 ? 0.01 : price >= 10 ? 0.1 : price >= 1 ? 1 : 10; }
export function autoQty(balance: number, leverage: number, price: number, fraction = 0.1, step = qtyStepFor(price)): number {
  return Number((Math.floor(((balance * fraction * leverage) / price) / step + 1e-9) * step).toFixed(8));
}
/** Isolated: ~entry∓(1/lev−MMR). Cross: the free balance also absorbs losses. */
export function liquidationPrice(p: Pick<DemoPosition, 'side' | 'entry' | 'leverage'> & Partial<Pick<DemoPosition, 'size' | 'margin' | 'marginMode'>>, freeBalance = 0): number {
  const long = p.side === 'LONG';
  if (p.marginMode === 'Cross' && p.size && p.margin) {
    const room = (p.margin + Math.max(0, freeBalance) - MMR * p.entry * p.size) / p.size;
    return Math.max(0, long ? p.entry - room : p.entry + room);
  }
  const d = Math.max(0.0005, 1 / p.leverage - MMR);
  return long ? p.entry * (1 - d) : p.entry * (1 + d);
}

export function validateDemoLevels(side: DemoSide, referencePrice: number, levels: { takeProfit?: number; stopLoss?: number }): void {
  if (!(referencePrice > 0)) throw new Error('Harga order tidak valid.');
  const { takeProfit: tp, stopLoss: sl } = levels;
  if (tp !== undefined && (!(tp > 0) || (side === 'LONG' ? tp <= referencePrice : tp >= referencePrice))) throw new Error(`Take Profit harus ${side === 'LONG' ? 'di atas' : 'di bawah'} harga entry.`);
  if (sl !== undefined && (!(sl > 0) || (side === 'LONG' ? sl >= referencePrice : sl <= referencePrice))) throw new Error(`Stop Loss harus ${side === 'LONG' ? 'di bawah' : 'di atas'} harga entry.`);
}

export function openDemo(s: DemoState, o: { symbol: string; side: DemoSide; qty: number; price: number; leverage: number; takeProfit?: number; takeProfits?: number[]; stopLoss?: number; source?: string; marginMode?: MarginMode }, now = Date.now()): DemoState {
  if (!(o.price > 0)) throw new Error('Harga market belum tersedia.');
  if (!(o.qty > 0) || !Number.isFinite(o.qty)) throw new Error('Quantity tidak valid.');
  const targets = (o.takeProfits || (o.takeProfit ? [o.takeProfit] : [])).filter((n) => Number.isFinite(n) && n > 0);
  validateDemoLevels(o.side, o.price, { takeProfit: targets[0] || o.takeProfit, stopLoss: o.stopLoss });
  const leverage = Math.max(1, Math.min(125, Math.round(o.leverage)));
  const margin = (o.price * o.qty) / leverage;
  if (margin > s.balance) throw new Error(`Saldo demo tidak cukup: butuh ${margin.toFixed(2)}, tersedia ${s.balance.toFixed(2)}.`);
  const position: DemoPosition = { id: `demo-${now}-${Math.random().toString(36).slice(2, 6)}`, symbol: o.symbol, side: o.side, size: o.qty, entry: o.price, leverage, margin, openedAt: now, takeProfit: targets[0] || o.takeProfit, takeProfits: targets, hitTakeProfits: [], stopLoss: o.stopLoss, source: o.source, marginMode: o.marginMode || 'Isolated' };
  return { ...s, balance: s.balance - margin, positions: [position, ...s.positions] };
}

/** Quantity for "margin = pct% of free balance" at the given leverage. */
export function qtyForMargin(balance: number, pct: number, leverage: number, price: number, step = qtyStepFor(price), minQty = 0): number {
  const raw = (balance * Math.max(0, Math.min(100, pct)) / 100 * leverage) / price;
  const q = Number(floorToStep(raw, step));
  if (!(q > 0) || q < minQty) throw new Error(`Margin ${pct}% terlalu kecil untuk ukuran minimum (${minQty || step}). Naikkan margin %.`);
  return q;
}

export function closeDemo(s: DemoState, id: string, price: number, reason: string, now = Date.now()): { state: DemoState; event: DemoEvent | null } {
  const position = s.positions.find((p) => p.id === id);
  if (!position) return { state: s, event: null };
  const floor = position.marginMode === 'Cross' ? -(position.margin + s.balance) : -position.margin;
  const pnl = Math.max(floor, pnlOf(position, price));
  const returned = Math.max(0, position.margin + pnl);
  return {
    state: { ...s, balance: s.balance + returned, positions: s.positions.filter((p) => p.id !== id), closed: [{ id: `${id}-close-${now}`, symbol: position.symbol, side: position.side, pnl, reason, closedAt: now, source: position.source, margin: position.margin, entry: position.entry, exit: price }, ...s.closed].slice(0, 200) },
    event: { position, reason, pnl },
  };
}

export function closeDemoFraction(s: DemoState, id: string, price: number, fraction: number, reason = 'Manual', now = Date.now()): { state: DemoState; event: DemoEvent | null } {
  const position = s.positions.find((p) => p.id === id);
  if (!position) return { state: s, event: null };
  const part = Math.max(0, Math.min(1, fraction));
  if (part >= 0.999999) return closeDemo(s, id, price, reason, now);
  if (!(part > 0) || !(price > 0)) return { state: s, event: null };
  const margin = position.margin * part;
  const floor = position.marginMode === 'Cross' ? -(margin + s.balance) : -margin;
  const pnl = Math.max(floor, pnlOf(position, price) * part);
  const remaining = { ...position, size: position.size * (1 - part), margin: position.margin - margin };
  const closed: DemoClosed = { id: `${id}-partial-${now}`, symbol: position.symbol, side: position.side, pnl, reason: `${reason} (${Math.round(part * 100)}%)`, closedAt: now, source: position.source, margin, entry: position.entry, exit: price };
  return {
    state: { ...s, balance: s.balance + Math.max(0, margin + pnl), positions: s.positions.map((p) => p.id === id ? remaining : p), closed: [closed, ...s.closed].slice(0, 200) },
    event: { position, reason: closed.reason, pnl },
  };
}

export function updateDemoTpSl(s: DemoState, id: string, levels: { takeProfit?: number; stopLoss?: number }): DemoState {
  const position = s.positions.find((p) => p.id === id);
  if (!position) return s;
  validateDemoLevels(position.side, position.entry, levels);
  const unchanged = levels.takeProfit === position.takeProfit;
  const takeProfits = unchanged ? position.takeProfits || [] : levels.takeProfit === undefined ? [] : [levels.takeProfit];
  const hitTakeProfits = unchanged ? position.hitTakeProfits || [] : [];
  return { ...s, positions: s.positions.map((p) => p.id === id ? { ...p, takeProfit: levels.takeProfit, takeProfits, hitTakeProfits, stopLoss: levels.stopLoss } : p) };
}

/** Closes positions whose TP/SL/liquidation price was reached at the given prices. */
export function checkTriggers(s: DemoState, prices: Record<string, number>, now = Date.now()): { state: DemoState; events: DemoEvent[] } {
  let state = s; const events: DemoEvent[] = [];
  for (const p of s.positions) {
    const price = prices[p.symbol];
    if (!price) continue;
    const long = p.side === 'LONG';
    const liq = liquidationPrice(p, state.balance);
    const hitLiq = long ? price <= liq : price >= liq;
    const hitSl = p.stopLoss !== undefined ? (long ? price <= p.stopLoss : price >= p.stopLoss) : false;
    const targets = p.takeProfits?.length ? p.takeProfits : p.takeProfit !== undefined ? [p.takeProfit] : [];
    const hitTp = targets.some((tp, i) => !p.hitTakeProfits?.includes(i) && (long ? price >= tp : price <= tp));
    const reason = hitLiq && !(hitSl && (long ? (p.stopLoss as number) >= liq : (p.stopLoss as number) <= liq)) ? 'Likuidasi' : hitSl ? 'Stop Loss' : '';
    if (reason) {
      const exitPrice = reason === 'Likuidasi' ? liq : (p.stopLoss as number);
      const r = closeDemo(state, p.id, exitPrice, reason, now);
      state = r.state; if (r.event) events.push(r.event);
      continue;
    }
    if (!hitTp) continue;
    if (hitTp) {
      for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i];
        const stillOpen = state.positions.find((x) => x.id === p.id);
        if (!stillOpen || stillOpen.hitTakeProfits?.includes(i) || !(long ? price >= target : price <= target)) continue;
        const fraction = i === targets.length - 1 ? 1 : 1 / (targets.length - i);
        const closed = closeDemoFraction(state, p.id, target, fraction, `Take Profit ${i + 1}`, now);
        state = closed.state;
        if (closed.event) events.push(closed.event);
        if (state.positions.some((x) => x.id === p.id)) state = { ...state, positions: state.positions.map((x) => x.id === p.id ? { ...x, hitTakeProfits: [...(x.hitTakeProfits || []), i] } : x) };
      }
    }
  }
  return { state, events };
}

/** How a call should enter: now at market, wait for entry to be touched, or it is already stale. */
export function decideEntry(side: DemoSide, entry: number, price: number, stopLoss: number, takeProfit: number, tolerance = 0.002, low = entry, high = entry): { kind: 'market' | 'pending' | 'stale'; waitFor?: 'up' | 'down'; targetPrice?: number; reason?: string } {
  const long = side === 'LONG';
  if ((long && (price <= stopLoss || price >= takeProfit)) || (!long && (price >= stopLoss || price <= takeProfit))) return { kind: 'stale', reason: 'Harga sudah melewati SL/TP call.' };
  const bottom = Math.min(low, high); const top = Math.max(low, high);
  if (price >= bottom && price <= top || bottom === top && Math.abs(price - entry) / entry <= tolerance) return { kind: 'market' };
  if (price > top) return { kind: 'pending', waitFor: 'down', targetPrice: top };
  return { kind: 'pending', waitFor: 'up', targetPrice: bottom };
}

export function queueDemoOrder(s: DemoState, o: Omit<DemoOrder, 'id' | 'createdAt' | 'expiresAt'>, now = Date.now()): DemoState {
  const order: DemoOrder = { ...o, id: `ord-${now}-${Math.random().toString(36).slice(2, 6)}`, createdAt: now, expiresAt: now + ORDER_TTL_MS };
  return { ...s, orders: [order, ...s.orders].slice(0, 30) };
}
export const cancelDemoOrder = (s: DemoState, id: string): DemoState => ({ ...s, orders: s.orders.filter((o) => o.id !== id) });

/** Fills / cancels / expires pending signal and local limit orders at the selected Demo market prices. */
export function processOrders(s: DemoState, prices: Record<string, number>, sizing: (symbol: string, price: number) => { step: number; minQty: number }, now = Date.now()): { state: DemoState; events: OrderEvent[] } {
  let state = s; const events: OrderEvent[] = [];
  for (const o of s.orders) {
    const price = prices[o.symbol];
    const drop = (kind: OrderEvent['kind'], reason: string) => { state = { ...state, orders: state.orders.filter((x) => x.id !== o.id) }; events.push({ order: o, kind, reason }); };
    if (now > o.expiresAt) { drop('expired', 'Entry tidak tersentuh dalam 24 jam.'); continue; }
    if (!price) continue;
    const long = o.side === 'LONG';
    const crossedTpSl = (long && ((o.takeProfit !== undefined && price >= o.takeProfit) || (o.stopLoss !== undefined && price <= o.stopLoss))) || (!long && ((o.takeProfit !== undefined && price <= o.takeProfit) || (o.stopLoss !== undefined && price >= o.stopLoss)));
    if (crossedTpSl) { drop('cancelled', 'TP/SL tercapai sebelum entry tersentuh.'); continue; }
    const crossed = o.waitFor === 'down' ? price <= o.entry : price >= o.entry;
    if (crossed) {
      try {
        const fill = o.orderType === 'limit' ? o.entry : o.waitFor === (long ? 'down' : 'up') ? o.entry : price;
        const { step, minQty } = sizing(o.symbol, fill);
        const qty = o.qty !== undefined ? o.qty : qtyForMargin(state.balance, o.marginPct, o.leverage, fill, step, minQty);
        state = openDemo({ ...state, orders: state.orders.filter((x) => x.id !== o.id) }, { symbol: o.symbol, side: o.side, qty, price: fill, leverage: o.leverage, takeProfit: o.takeProfit, takeProfits: o.takeProfits, stopLoss: o.stopLoss, source: o.source, marginMode: o.marginMode }, now);
        events.push({ order: o, kind: 'filled', reason: `Entry tersentuh di ${fill}.` });
      } catch (e) { drop('rejected', e instanceof Error ? e.message : 'Order ditolak.'); }
      continue;
    }
  }
  return { state, events };
}

export type DemoStats = { trades: number; wins: number; winRate: number; totalPnl: number; avgWin: number; avgLoss: number; profitFactor: number; bySource: Array<{ source: string; trades: number; pnl: number; winRate: number }> };
export function demoStats(closed: DemoClosed[]): DemoStats {
  const wins = closed.filter((c) => c.pnl > 0); const losses = closed.filter((c) => c.pnl <= 0);
  const gain = wins.reduce((a, c) => a + c.pnl, 0); const loss = Math.abs(losses.reduce((a, c) => a + c.pnl, 0));
  const groups = new Map<string, DemoClosed[]>();
  closed.forEach((c) => { const k = c.source || 'Manual'; groups.set(k, [...(groups.get(k) || []), c]); });
  return {
    trades: closed.length, wins: wins.length, winRate: closed.length ? wins.length / closed.length : 0, totalPnl: gain - loss,
    avgWin: wins.length ? gain / wins.length : 0, avgLoss: losses.length ? loss / losses.length : 0, profitFactor: loss > 0 ? gain / loss : gain > 0 ? Infinity : 0,
    bySource: Array.from(groups.entries()).map(([source, list]) => ({ source, trades: list.length, pnl: list.reduce((a, c) => a + c.pnl, 0), winRate: list.filter((c) => c.pnl > 0).length / list.length })).sort((a, b) => b.pnl - a.pnl),
  };
}

/** Backup format for the paper account (versioned JSON). */
export const serializeDemo = (s: DemoState): string => JSON.stringify({ app: 'xo-trade', kind: 'demo-account', version: 1, exportedAt: Date.now(), demo: s });
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
/** Validates strictly: anything malformed is rejected instead of being silently repaired. */
export function parseDemo(text: string): DemoState {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('File backup bukan JSON yang valid.'); }
  const d = (raw as { app?: string; kind?: string; demo?: Partial<DemoState> })?.demo;
  if ((raw as { app?: string })?.app !== 'xo-trade' || !d) throw new Error('Bukan backup akun demo Hyperlink.');
  if (!num(d.balance) || (d.balance as number) < 0 || !Array.isArray(d.positions) || !Array.isArray(d.closed)) throw new Error('Isi backup tidak lengkap.');
  for (const p of d.positions) if (!p || typeof p.symbol !== 'string' || (p.side !== 'LONG' && p.side !== 'SHORT') || !num(p.size) || !num(p.entry) || !num(p.leverage) || !num(p.margin) || p.size <= 0 || p.entry <= 0) throw new Error('Ada posisi di backup yang tidak valid.');
  for (const c of d.closed) if (!c || typeof c.symbol !== 'string' || !num(c.pnl)) throw new Error('Ada riwayat di backup yang tidak valid.');
  return normalizeDemo(d);
}
