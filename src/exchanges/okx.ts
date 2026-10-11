import { fetchJson, clockOffset, hmacBase64, toQuery, type Params } from './util';
import { ExchangeError, baseOf, normalizeSymbol, type Candle, type ClosedTrade, type OpenOrder, type OrderBook, type PublicTrade, type Env, type Exchange, type ExchangeKeys, type Instrument, type MarketTicker, type OrderPlan, type Position, type TpSl } from './types';
import { floorToStep } from '../format';

const BASE = 'https://www.okx.com';
type Envelope<T> = { code: string; msg: string; data: T };
const instId = (symbol: string) => `${baseOf(symbol)}-USDT-SWAP`;
const fromInstId = (id: string) => id.replace('-SWAP', '').replace('-', '');

function fail(code: string, msg: string, status: number): never {
  let m = msg || `HTTP ${status}`;
  if (code === '50102' || code === '50112') m += ' · Jam HP mungkin tidak akurat: aktifkan "Waktu otomatis".';
  if (code === '50101' || code === '50105') m += ' · Key demo hanya dipakai pada mode Demo, key live pada mode Mainnet.';
  throw new ExchangeError('OKX', code || status, m);
}

async function call<T>(k: ExchangeKeys | null, env: Env, method: 'GET' | 'POST', path: string, params: Params = {}, jsonBody?: unknown): Promise<T> {
  const query = method === 'GET' ? toQuery(params) : '';
  const requestPath = `${path}${query ? `?${query}` : ''}`;
  const body = method === 'POST' ? JSON.stringify(jsonBody ?? {}) : '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env === 'testnet') headers['x-simulated-trading'] = '1';
  if (k) {
    if (!k.apiKey.trim() || !k.apiSecret.trim() || !k.passphrase.trim()) throw new Error('OKX API Key, Secret, dan Passphrase wajib diisi.');
    const off = await clockOffset('okx', async () => Number((await fetchJson<Envelope<Array<{ ts: string }>>>(`${BASE}/api/v5/public/time`, {}, 8000)).body.data?.[0]?.ts));
    const ts = new Date(Date.now() + off).toISOString();
    headers['OK-ACCESS-KEY'] = k.apiKey.trim(); headers['OK-ACCESS-SIGN'] = hmacBase64(`${ts}${method}${requestPath}${body}`, k.apiSecret.trim()); headers['OK-ACCESS-TIMESTAMP'] = ts; headers['OK-ACCESS-PASSPHRASE'] = k.passphrase.trim();
  }
  const res = await fetchJson<Envelope<T>>(`${BASE}${requestPath}`, { method, headers, body: method === 'POST' ? body : undefined });
  if (!res.ok || res.body.code !== '0') {
    const detail = Array.isArray(res.body.data) ? (res.body.data as Array<{ sCode?: string; sMsg?: string }>)[0] : undefined;
    fail(detail?.sCode && detail.sCode !== '0' ? detail.sCode : res.body.code, detail?.sMsg || res.body.msg, res.status);
  }
  return res.body.data;
}

type Inst = { ctVal: string; lotSz: string; minSz: string; tickSz: string; lever: string; state: string; maxMktSz?: string };
const cache: Record<string, Inst> = {};
async function inst(env: Env, symbol: string): Promise<Inst> {
  const id = instId(symbol);
  if (cache[id]) return cache[id];
  const d = await call<Inst[]>(null, env, 'GET', '/api/v5/public/instruments', { instType: 'SWAP', instId: id });
  const i = d[0];
  if (!i) throw new Error(`Pair ${id} tidak ada di OKX.`);
  if (i.state && i.state !== 'live') throw new Error(`${id} sedang tidak diperdagangkan (${i.state}).`);
  cache[id] = i;
  return i;
}
async function pendingAlgos(k: ExchangeKeys): Promise<Array<Record<string, string>>> {
  const kinds = await Promise.all(['conditional', 'oco'].map((ordType) => call<Array<Record<string, string>>>(k, k.env, 'GET', '/api/v5/trade/orders-algo-pending', { ordType, instType: 'SWAP' })));
  return kinds.flat();
}
const mul = (a: string, b: string) => { const v = Number(a) * Number(b); return Number(v.toFixed(12)).toString(); };

export const okx: Exchange = {
  id: 'okx', label: 'OKX', needsPassphrase: true, hasTestnet: true, testnetLabel: 'Demo',
  keyHint: 'OKX → API → izin Read + Trade, isi Passphrase. Untuk Demo gunakan key dari Demo Trading.',
  async account(k) {
    const d = await call<Array<{ totalEq?: string; details?: Array<{ ccy: string; availEq?: string; availBal?: string; cashBal?: string }> }>>(k, k.env, 'GET', '/api/v5/account/balance');
    const a = d[0]; const u = a?.details?.find((x) => x.ccy === 'USDT');
    return { equity: a?.totalEq || '0', available: u?.availEq || u?.availBal || '0', walletBalance: u?.cashBal || '0' };
  },
  async positions(k) {
    const d = await call<Array<Record<string, string>>>(k, k.env, 'GET', '/api/v5/account/positions', { instType: 'SWAP' });
    const out: Position[] = [];
    for (const p of d.filter((x) => x.instId.endsWith('-USDT-SWAP') && Number(x.pos) !== 0)) {
      const ct = (await inst(k.env, fromInstId(p.instId))).ctVal;
      const side = p.posSide === 'short' ? 'SHORT' : p.posSide === 'long' ? 'LONG' : Number(p.pos) < 0 ? 'SHORT' : 'LONG';
      out.push({ symbol: fromInstId(p.instId), side, size: mul(String(Math.abs(Number(p.pos))), ct), avgPrice: p.avgPx, markPrice: p.markPx, unrealisedPnl: p.upl, leverage: p.lever, liqPrice: p.liqPx, idx: p.posSide || 'net', marginMode: p.mgnMode === 'isolated' ? 'isolated' : 'cross' });
    }
    let algos: Array<Record<string, string>> = [];
    try { algos = await pendingAlgos(k); } catch { /* SL/TP display is best effort */ }
    return out.map((p) => { const a = algos.filter((x) => fromInstId(x.instId) === p.symbol && (x.posSide || 'net') === p.idx); const sl = a.find((x) => Number(x.slTriggerPx)); const tp = a.find((x) => Number(x.tpTriggerPx)); return { ...p, stopLoss: sl?.slTriggerPx, takeProfit: tp?.tpTriggerPx }; });
  },
  async instrument(env, symbol): Promise<Instrument> {
    const i = await inst(env, symbol);
    return { symbol: normalizeSymbol(symbol), tickSize: i.tickSz, qtyStep: mul(i.lotSz, i.ctVal), minQty: mul(i.minSz, i.ctVal), maxQty: mul(i.maxMktSz || '100000000', i.ctVal), maxLeverage: Number(i.lever) || 1, minNotional: 0 };
  },
  async lastPrice(env, symbol) {
    const d = await call<Array<{ last: string }>>(null, env, 'GET', '/api/v5/market/ticker', { instId: instId(symbol) });
    const p = Number(d[0]?.last);
    if (!p) throw new Error(`Harga ${symbol} tidak tersedia di OKX.`);
    return p;
  },
  async tickers(env, symbols): Promise<MarketTicker[]> {
    const d = await call<Array<{ instId: string; last: string; open24h: string; volCcy24h?: string }>>(null, env, 'GET', '/api/v5/market/tickers', { instType: 'SWAP' });
    const want = new Set(symbols.map(normalizeSymbol));
    return d.filter((t) => t.instId.endsWith('-USDT-SWAP') && want.has(fromInstId(t.instId))).map((t) => ({ symbol: fromInstId(t.instId), last: Number(t.last), change24h: Number(t.open24h) > 0 ? Number(t.last) / Number(t.open24h) - 1 : 0, volume24h: Number(t.volCcy24h) * Number(t.last) || undefined }));
  },
  async marketTickers(env): Promise<MarketTicker[]> {
    const d = await call<Array<{ instId: string; last: string; open24h: string; volCcy24h?: string }>>(null, env, 'GET', '/api/v5/market/tickers', { instType: 'SWAP' });
    return d.filter((t) => t.instId.endsWith('-USDT-SWAP') && Number(t.last) > 0).map((t) => ({ symbol: fromInstId(t.instId), last: Number(t.last), change24h: Number(t.open24h) > 0 ? Number(t.last) / Number(t.open24h) - 1 : 0, volume24h: Number(t.volCcy24h) * Number(t.last) || undefined }));
  },
  async submit(k, plan: OrderPlan) {
    const i = await inst(k.env, plan.symbol);
    const cfg = await call<Array<{ posMode?: string }>>(k, k.env, 'GET', '/api/v5/account/config');
    const hedge = cfg[0]?.posMode === 'long_short_mode';
    const long = plan.side === 'Buy';
    const mgn = plan.marginMode === 'Cross' ? 'cross' : 'isolated';
    const contracts = floorToStep(Number(plan.qty) / Number(i.ctVal), i.lotSz);
    if (!(Number(contracts) >= Number(i.minSz))) throw new Error(`Ukuran ${contracts} kontrak di bawah minimum ${i.minSz}.`);
    const lev: Record<string, string> = { instId: instId(plan.symbol), lever: String(plan.leverage), mgnMode: mgn };
    if (hedge && mgn === 'isolated') lev.posSide = long ? 'long' : 'short';
    await call(k, k.env, 'POST', '/api/v5/account/set-leverage', {}, lev);
    const attachedExit: Record<string, string> = { slTriggerPx: plan.stopLoss, slOrdPx: '-1', slTriggerPxType: 'mark' };
    if (Number(plan.takeProfit) > 0) Object.assign(attachedExit, { tpTriggerPx: plan.takeProfit, tpOrdPx: '-1', tpTriggerPxType: 'mark' });
    const order: Record<string, unknown> = { instId: instId(plan.symbol), tdMode: mgn, side: long ? 'buy' : 'sell', ordType: 'market', sz: contracts, clOrdId: `xo${Date.now()}`, attachAlgoOrds: [attachedExit] };
    if (hedge) order.posSide = long ? 'long' : 'short';
    const r = await call<Array<{ ordId: string }>>(k, k.env, 'POST', '/api/v5/trade/order', {}, order);
    return { orderId: r[0].ordId };
  },
  async closePosition(k, pos, qty) {
    const id = instId(pos.symbol); const mgn = pos.marginMode === 'isolated' ? 'isolated' : 'cross'; const posSide = pos.idx || 'net';
    if (!qty) {
      await call(k, k.env, 'POST', '/api/v5/trade/close-position', {}, { instId: id, mgnMode: mgn, posSide: posSide === 'net' ? undefined : posSide, autoCxl: true });
      return {};
    }
    const i = await inst(k.env, pos.symbol);
    const contracts = floorToStep(Number(qty) / Number(i.ctVal), i.lotSz);
    if (!(Number(contracts) >= Number(i.minSz))) throw new Error(`Ukuran ${contracts} kontrak di bawah minimum ${i.minSz}.`);
    const r = await call<Array<{ ordId: string }>>(k, k.env, 'POST', '/api/v5/trade/order', {}, { instId: id, tdMode: mgn, side: pos.side === 'LONG' ? 'sell' : 'buy', ordType: 'market', sz: contracts, posSide: posSide === 'net' ? undefined : posSide, reduceOnly: posSide === 'net' ? true : undefined, clOrdId: `xoc${Date.now()}` });
    return { orderId: r[0]?.ordId };
  },
  async setTpSl(k, pos, v: TpSl) {
    if (!v.takeProfit && !v.stopLoss) return;
    const id = instId(pos.symbol); const posSide = pos.idx || 'net';
    const old = (await pendingAlgos(k)).filter((a) => a.instId === id && (a.posSide || 'net') === posSide);
    const prevSl = old.find((a) => Number(a.slTriggerPx))?.slTriggerPx; const prevTp = old.find((a) => Number(a.tpTriggerPx))?.tpTriggerPx;
    const pick = (next: string | undefined, prev: string | undefined) => (next === '0' ? '' : next || prev || '');
    const sl = pick(v.stopLoss, prevSl); const tp = pick(v.takeProfit, prevTp);
    if (old.length) await call(k, k.env, 'POST', '/api/v5/trade/cancel-algos', {}, old.map((a) => ({ algoId: a.algoId, instId: id })));
    if (!sl && !tp) return;
    const body: Record<string, unknown> = { instId: id, tdMode: pos.marginMode === 'isolated' ? 'isolated' : 'cross', side: pos.side === 'LONG' ? 'sell' : 'buy', posSide: posSide === 'net' ? undefined : posSide, ordType: sl && tp ? 'oco' : 'conditional', closeFraction: '1', reduceOnly: true };
    if (tp) { body.tpTriggerPx = tp; body.tpOrdPx = '-1'; body.tpTriggerPxType = 'mark'; }
    if (sl) { body.slTriggerPx = sl; body.slOrdPx = '-1'; body.slTriggerPxType = 'mark'; }
    await call(k, k.env, 'POST', '/api/v5/trade/order-algo', {}, body);
  },
  async openOrders(k): Promise<OpenOrder[]> {
    const d = await call<Array<Record<string, string>>>(k, k.env, 'GET', '/api/v5/trade/orders-pending', { instType: 'SWAP' });
    const out: OpenOrder[] = [];
    for (const o of d.filter((x) => x.instId.endsWith('-USDT-SWAP'))) {
      const symbol = fromInstId(o.instId); const ct = Number((await inst(k.env, symbol)).ctVal) || 1;
      out.push({ id: o.ordId, symbol, side: o.side === 'sell' ? 'Sell' : 'Buy', type: o.ordType || 'limit', price: Number(o.px) || 0, qty: Number(o.sz) * ct, reduceOnly: o.reduceOnly === 'true', createdAt: Number(o.cTime) || undefined });
    }
    return out;
  },
  async cancelOrder(k, order) { await call(k, k.env, 'POST', '/api/v5/trade/cancel-order', {}, { instId: instId(order.symbol), ordId: order.id }); },
  async setLeverage(k, pos, leverage) {
    const isolated = pos.marginMode === 'isolated';
    const posSide = pos.idx && pos.idx !== 'net' ? pos.idx : undefined;
    await call(k, k.env, 'POST', '/api/v5/account/set-leverage', {}, { instId: instId(pos.symbol), lever: String(leverage), mgnMode: isolated ? 'isolated' : 'cross', posSide: isolated ? posSide : undefined });
  },
  async closedTrades(k): Promise<ClosedTrade[]> {
    const d = await call<Array<Record<string, string>>>(k, k.env, 'GET', '/api/v5/account/positions-history', { instType: 'SWAP', limit: 50 });
    return d.filter((x) => x.instId.endsWith('-USDT-SWAP')).map((x): ClosedTrade => ({ symbol: fromInstId(x.instId), side: x.direction === 'short' ? 'SHORT' : 'LONG', pnl: Number(x.pnl) || 0, entry: Number(x.openAvgPx) || undefined, exit: Number(x.closeAvgPx) || undefined, closedAt: Number(x.uTime) || 0 }));
  },
  async orderBook(env, symbol): Promise<OrderBook> {
    const d = await call<Array<{ asks?: string[][]; bids?: string[][] }>>(null, env, 'GET', '/api/v5/market/books', { instId: instId(symbol), sz: 20 });
    const ct = Number((await inst(env, symbol)).ctVal) || 1;
    const lv = (rows?: string[][]) => (rows || []).map((x) => ({ price: Number(x[0]), qty: Number(x[1]) * ct }));
    return { bids: lv(d[0]?.bids), asks: lv(d[0]?.asks) };
  },
  async recentTrades(env, symbol): Promise<PublicTrade[]> {
    const d = await call<Array<Record<string, string>>>(null, env, 'GET', '/api/v5/market/trades', { instId: instId(symbol), limit: 30 });
    const ct = Number((await inst(env, symbol)).ctVal) || 1;
    return d.map((x): PublicTrade => ({ t: Number(x.ts), price: Number(x.px), qty: Number(x.sz) * ct, side: x.side === 'sell' ? 'Sell' : 'Buy' }));
  },
  async candles(env, symbol, since, interval): Promise<Candle[]> {
    const bar = { '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '12h': '12H', '1d': '1D', '1w': '1W' }[interval];
    const out: Candle[] = []; let after = String(Date.now() + 60000);
    for (let n = 0; n < 20; n += 1) {
      const d = await call<string[][]>(null, env, 'GET', '/api/v5/market/history-candles', { instId: instId(symbol), bar, after, limit: 100 });
      if (!d.length) break;
      d.forEach((c) => out.push({ t: Number(c[0]), o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v: Number(c[5]) || 0 }));
      const oldest = Number(d[d.length - 1][0]); if (oldest <= since) break; after = String(oldest);
    }
    return out.filter((c) => c.t >= since - 1).sort((a, b) => a.t - b.t);
  },
};
