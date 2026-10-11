import { fetchJson, hmacBase64, toQuery, clean, type Params } from './util';
import { ExchangeError, normalizeSymbol, type Candle, type ClosedTrade, type OpenOrder, type OrderBook, type PublicTrade, type Exchange, type ExchangeKeys, type Instrument, type MarketTicker, type OrderPlan, type Position, type TpSl } from './types';

const BASE = 'https://api.bitget.com';
const CATEGORY = 'USDT-FUTURES';
type Envelope<T> = { code: string; msg: string; data: T };

function fail(code: string, msg: string, status: number): never {
  let m = msg || `HTTP ${status}`;
  if (/timestamp|expired/i.test(m)) m += ' · Jam HP mungkin tidak akurat: aktifkan "Waktu otomatis".';
  if (/uta|unified/i.test(m) || ['40084', '40085'].includes(code)) m += ' · Pastikan akun Bitget sudah di-upgrade ke UTA dan API key dibuat di Bitget Exchange (bukan Wallet).';
  throw new ExchangeError('Bitget', code || status, m);
}

async function call<T>(k: ExchangeKeys | null, method: 'GET' | 'POST', path: string, params: Params = {}): Promise<T> {
  const c = clean(params);
  const query = method === 'GET' ? toQuery(c) : '';
  const body = method === 'POST' ? JSON.stringify(c) : '';
  const url = `${BASE}${path}${query ? `?${query}` : ''}`;
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json', locale: 'en-US' };
  if (k) {
    const key = k.apiKey.trim(); const secret = k.apiSecret.trim(); const pass = k.passphrase.trim();
    if (!key || !secret || !pass) throw new Error('Bitget API Key, Secret, dan Passphrase wajib diisi.');
    const ts = String(Date.now());
    headers['ACCESS-KEY'] = key; headers['ACCESS-SIGN'] = hmacBase64(`${ts}${method}${path}${query ? `?${query}` : ''}${body}`, secret); headers['ACCESS-TIMESTAMP'] = ts; headers['ACCESS-PASSPHRASE'] = pass;
  }
  const res = await fetchJson<Envelope<T>>(url, { method, headers, body: method === 'POST' ? body : undefined });
  if (!res.ok || res.body.code !== '00000') fail(res.body.code, res.body.msg, res.status);
  return res.body.data;
}

const stepFrom = (multiplier: string | undefined, precision: string | undefined) => (Number(multiplier) > 0 ? String(multiplier) : (1 / Math.pow(10, Number(precision || 0))).toFixed(Number(precision || 0)));
async function strategyOrders(k: ExchangeKeys): Promise<Array<Record<string, string>>> {
  try { const d = await call<Array<Record<string, string>> | { list?: Array<Record<string, string>> }>(k, 'GET', '/api/v3/trade/unfilled-strategy-orders', { category: CATEGORY, type: 'tpsl' }); return list(d).filter((o) => !o.status || o.status === 'pending'); } catch { return []; }
}
async function isHedge(k: ExchangeKeys): Promise<boolean> {
  try { const s = await call<{ holdMode?: string }>(k, 'GET', '/api/v3/account/settings'); return s.holdMode === 'hedge_mode'; } catch { return false; }
}
const list = <T>(data: T[] | { list?: T[] }): T[] => (Array.isArray(data) ? data : data?.list || []);

export const bitget: Exchange = {
  id: 'bitget', label: 'Bitget', needsPassphrase: true, hasTestnet: false, testnetLabel: '',
  keyHint: 'Bitget Exchange (UTA) → API Management → izin Read + UTA Trade, isi Passphrase. Tanpa Withdraw.',
  async account(k) {
    const d = await call<{ accountEquity?: string; usdtEquity?: string; assets?: Array<{ coin: string; available?: string; balance?: string; equity?: string }> }>(k, 'GET', '/api/v3/account/assets');
    const u = d.assets?.find((a) => a.coin.toUpperCase() === 'USDT');
    return { equity: d.usdtEquity || d.accountEquity || '0', available: u?.available || u?.balance || '0', walletBalance: u?.balance || u?.equity || '0' };
  },
  async positions(k) {
    const d = await call<{ list?: Array<Record<string, string>> }>(k, 'GET', '/api/v3/position/current-position', { category: CATEGORY });
    const orders = await strategyOrders(k);
    const out = list(d as { list?: Array<Record<string, string>> }).filter((p) => Number(p.total || p.available || 0) > 0).map((p): Position => ({ symbol: p.symbol, side: String(p.posSide).toLowerCase() === 'short' ? 'SHORT' : 'LONG', size: p.total || p.available, avgPrice: p.avgPrice || '0', markPrice: p.markPrice, unrealisedPnl: p.unrealisedPnl || '0', leverage: p.leverage || '1', stopLoss: p.stopLoss, takeProfit: p.takeProfit, liqPrice: p.liqPrice || p.liquidationPrice, idx: String(p.posSide || '').toLowerCase(), marginMode: String(p.marginMode || '').toLowerCase().startsWith('iso') ? 'isolated' : 'cross' }));
    return out.map((p) => { const o = orders.find((x) => x.symbol === p.symbol && (!x.posSide || !p.idx || x.posSide === p.idx)); return o ? { ...p, stopLoss: Number(o.stopLoss) ? o.stopLoss : p.stopLoss, takeProfit: Number(o.takeProfit) ? o.takeProfit : p.takeProfit } : p; });
  },
  async instrument(_env, symbol): Promise<Instrument> {
    const sym = normalizeSymbol(symbol);
    const d = await call<Array<Record<string, string>> | { list?: Array<Record<string, string>> }>(null, 'GET', '/api/v3/market/instruments', { category: CATEGORY, symbol: sym });
    const i = list(d).find((x) => x.symbol === sym);
    if (!i || (i.status && i.status !== 'online')) throw new Error(`Pair ${sym} tidak tersedia untuk trading di Bitget saat ini.`);
    return { symbol: sym, tickSize: stepFrom(i.priceMultiplier, i.pricePrecision), qtyStep: stepFrom(i.quantityMultiplier, i.quantityPrecision), minQty: i.minOrderQty || '0', maxQty: i.maxOrderQty || '1000000000', maxLeverage: Number(i.maxLeverage) || 1, minNotional: Number(i.minOrderAmount) || 5 };
  },
  async lastPrice(env, symbol) {
    const t = await this.tickers(env, [symbol]);
    if (!t[0]?.last) throw new Error(`Harga ${symbol} tidak tersedia di Bitget.`);
    return t[0].last;
  },
  async tickers(_env, symbols): Promise<MarketTicker[]> {
    const d = await call<Array<Record<string, string>> | { list?: Array<Record<string, string>> }>(null, 'GET', '/api/v3/market/tickers', { category: CATEGORY });
    const want = new Set(symbols.map(normalizeSymbol));
    return list(d).filter((t) => want.has(normalizeSymbol(t.symbol))).map((t) => ({ symbol: normalizeSymbol(t.symbol), last: Number(t.lastPrice || t.lastPr), change24h: Number(t.price24hPcnt || t.change24h || 0), volume24h: Number(t.quoteVolume || t.usdtVolume || t.quoteVol || t.volume24h) || undefined }));
  },
  async marketTickers(_env): Promise<MarketTicker[]> {
    const d = await call<Array<Record<string, string>> | { list?: Array<Record<string, string>> }>(null, 'GET', '/api/v3/market/tickers', { category: CATEGORY });
    return list(d).filter((t) => /^[A-Z0-9]+USDT$/.test(normalizeSymbol(t.symbol)) && Number(t.lastPrice || t.lastPr) > 0).map((t) => ({ symbol: normalizeSymbol(t.symbol), last: Number(t.lastPrice || t.lastPr), change24h: Number(t.price24hPcnt || t.change24h || 0), volume24h: Number(t.quoteVolume || t.usdtVolume || t.quoteVol || t.volume24h) || undefined }));
  },
  async submit(k, plan: OrderPlan) {
    const isolated = plan.marginMode === 'Isolated';
    const side = plan.side === 'Buy' ? 'buy' : 'sell';
    const posSide = side === 'buy' ? 'long' : 'short';
    let hedge = false;
    try { const s = await call<{ holdMode?: string }>(k, 'GET', '/api/v3/account/settings'); hedge = s.holdMode === 'hedge_mode'; } catch { /* assume one-way */ }
    try { await call(k, 'POST', '/api/v3/account/set-leverage', { category: CATEGORY, symbol: plan.symbol, leverage: String(plan.leverage), marginMode: isolated ? 'isolated' : 'crossed', posSide: isolated ? posSide : undefined }); }
    catch (e) { if (!(e instanceof ExchangeError && /same|not change|unchanged/i.test(e.message))) throw e; }
    const r = await call<{ orderId: string }>(k, 'POST', '/api/v3/trade/place-order', { category: CATEGORY, symbol: plan.symbol, qty: plan.qty, side, orderType: 'market', marginMode: isolated ? 'isolated' : 'crossed', clientOid: `xo${Date.now()}`, takeProfit: Number(plan.takeProfit) > 0 ? plan.takeProfit : undefined, stopLoss: plan.stopLoss, tpTriggerBy: Number(plan.takeProfit) > 0 ? 'mark' : undefined, slTriggerBy: 'mark', tpOrderType: Number(plan.takeProfit) > 0 ? 'market' : undefined, slOrderType: 'market', posSide: hedge ? posSide : undefined });
    return { orderId: r.orderId };
  },
  async closePosition(k, pos, qty) {
    const hedge = await isHedge(k);
    const posSide = pos.side === 'LONG' ? 'long' : 'short';
    const r = await call<{ orderId: string }>(k, 'POST', '/api/v3/trade/place-order', { category: CATEGORY, symbol: pos.symbol, qty: qty || pos.size, side: pos.side === 'LONG' ? 'sell' : 'buy', orderType: 'market', posSide: hedge ? posSide : undefined, reduceOnly: hedge ? undefined : 'yes', clientOid: `xoc${Date.now()}` });
    return { orderId: r.orderId };
  },
  async setTpSl(k, pos, v: TpSl) {
    if (!v.takeProfit && !v.stopLoss) return;
    const hedge = await isHedge(k);
    const posSide = pos.side === 'LONG' ? 'long' : 'short';
    const existing = (await strategyOrders(k)).filter((o) => o.symbol === pos.symbol && (!o.posSide || o.posSide === posSide));
    const prev = existing[0] || {};
    const pick = (next: string | undefined, old: string | undefined, pos0: string | undefined) => (next === '0' ? '' : next || (Number(old) ? old : Number(pos0) ? pos0 : '') || '');
    const stopLoss = pick(v.stopLoss, prev.stopLoss, pos.stopLoss); const takeProfit = pick(v.takeProfit, prev.takeProfit, pos.takeProfit);
    for (const o of existing) { try { await call(k, 'POST', '/api/v3/trade/cancel-strategy-order', { orderId: o.orderId }); } catch { /* may already be gone */ } }
    if (!stopLoss && !takeProfit) return;
    await call(k, 'POST', '/api/v3/trade/place-strategy-order', { category: CATEGORY, symbol: pos.symbol, type: 'tpsl', tpslMode: 'full', side: pos.side === 'LONG' ? 'sell' : 'buy', posSide: hedge ? posSide : undefined, reduceOnly: hedge ? undefined : 'yes', takeProfit: takeProfit || undefined, stopLoss: stopLoss || undefined, tpTriggerBy: takeProfit ? 'mark' : undefined, slTriggerBy: stopLoss ? 'mark' : undefined, tpOrderType: takeProfit ? 'market' : undefined, slOrderType: stopLoss ? 'market' : undefined, clientOid: `xot${Date.now()}` });
  },
  async openOrders(k): Promise<OpenOrder[]> {
    const d = await call<Array<Record<string, string>> | { list?: Array<Record<string, string>> }>(k, 'GET', '/api/v3/trade/unfilled-orders', { category: CATEGORY });
    return list(d).map((o): OpenOrder => ({ id: String(o.orderId), symbol: normalizeSymbol(o.symbol), side: String(o.side).toLowerCase() === 'sell' ? 'Sell' : 'Buy', type: String(o.orderType || 'limit'), price: Number(o.price) || 0, qty: Number(o.qty || o.size) || 0, reduceOnly: String(o.reduceOnly).toLowerCase() === 'yes' || o.reduceOnly === 'true', createdAt: Number(o.createdTime || o.cTime) || undefined }));
  },
  async cancelOrder(k, order) { await call(k, 'POST', '/api/v3/trade/cancel-order', { category: CATEGORY, symbol: order.symbol, orderId: order.id }); },
  async setLeverage(k, pos, leverage) {
    const isolated = pos.marginMode === 'isolated';
    try { await call(k, 'POST', '/api/v3/account/set-leverage', { category: CATEGORY, symbol: pos.symbol, leverage: String(leverage), marginMode: isolated ? 'isolated' : 'crossed', posSide: isolated ? (pos.side === 'LONG' ? 'long' : 'short') : undefined }); }
    catch (e) { if (!(e instanceof ExchangeError && /same|not change|unchanged/i.test(e.message))) throw e; }
  },
  async closedTrades(k): Promise<ClosedTrade[]> {
    const d = await call<Array<Record<string, string>> | { list?: Array<Record<string, string>> }>(k, 'GET', '/api/v3/position/history-position', { category: CATEGORY, limit: 50 });
    return list(d).map((x): ClosedTrade => ({ symbol: normalizeSymbol(x.symbol), side: String(x.posSide).toLowerCase() === 'short' ? 'SHORT' : 'LONG', pnl: Number(x.netProfit ?? x.pnl ?? x.profit) || 0, entry: Number(x.openAvgPrice) || undefined, exit: Number(x.closeAvgPrice) || undefined, qty: Number(x.closeTotalPos) || undefined, closedAt: Number(x.updatedTime || x.uTime || x.createdTime) || 0 }));
  },
  async orderBook(_env, symbol): Promise<OrderBook> {
    const d = await call<{ a?: string[][]; b?: string[][] }>(null, 'GET', '/api/v3/market/orderbook', { category: CATEGORY, symbol: normalizeSymbol(symbol), limit: 20 });
    const lv = (rows?: string[][]) => (rows || []).map((x) => ({ price: Number(x[0]), qty: Number(x[1]) }));
    return { bids: lv(d.b), asks: lv(d.a) };
  },
  async recentTrades(_env, symbol): Promise<PublicTrade[]> {
    const d = await call<Array<Record<string, string>> | { list?: Array<Record<string, string>> }>(null, 'GET', '/api/v3/market/fills', { category: CATEGORY, symbol: normalizeSymbol(symbol), limit: 30 });
    return list(d).map((x): PublicTrade => ({ t: Number(x.ts || x.time), price: Number(x.price), qty: Number(x.size || x.qty), side: String(x.side).toLowerCase() === 'sell' ? 'Sell' : 'Buy' }));
  },
  async candles(_env, symbol, since, interval): Promise<Candle[]> {
    const step = { '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '12h': '12H', '1d': '1D', '1w': '1W' }[interval];
    const d = await call<string[][] | { list?: string[][] }>(null, 'GET', '/api/v3/market/candles', { category: CATEGORY, symbol: normalizeSymbol(symbol), interval: step, startTime: since, limit: 1000 });
    return list(d as string[][]).map((c) => ({ t: Number(c[0]), o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v: Number(c[5]) || 0 })).sort((a, b) => a.t - b.t);
  },
};
