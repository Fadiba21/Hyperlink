import { fetchJson, clockOffset, hmacHex, timeHint, toQuery, type Params } from './util';
import { ExchangeError, normalizeSymbol, type Candle, type ClosedTrade, type OpenOrder, type OrderBook, type PublicTrade, type Env, type Exchange, type ExchangeKeys, type Instrument, type MarketTicker, type OrderPlan, type Position, type TpSl } from './types';

const RECV = '10000';
const base = (env: Env) => (env === 'mainnet' ? 'https://api.bybit.com' : 'https://api-testnet.bybit.com');
type Envelope<T> = { retCode: number; retMsg: string; result: T; time?: number };

function fail(code: number, msg: string, status: number): never {
  let m = msg || `HTTP ${status}`;
  if (code === 10002 || code === 10004) m += ` · ${timeHint}`;
  if (status === 403) m = 'Bybit menolak request (403): periksa IP restriction/region API key.';
  throw new ExchangeError('Bybit', code || status, m);
}

async function pub<T>(env: Env, path: string, params: Params): Promise<T> {
  const res = await fetchJson<Envelope<T>>(`${base(env)}${path}?${toQuery(params)}`);
  if (!res.ok || res.body.retCode !== 0) fail(res.body.retCode, res.body.retMsg, res.status);
  return res.body.result;
}

async function signed<T>(k: ExchangeKeys, method: 'GET' | 'POST', path: string, params: Params): Promise<T> {
  const key = k.apiKey.trim(); const secret = k.apiSecret.trim();
  if (!key || !secret) throw new Error('Bybit API Key dan Secret belum diisi.');
  const off = await clockOffset(`bybit-${k.env}`, async () => Number((await fetchJson<Envelope<unknown>>(`${base(k.env)}/v5/market/time`, {}, 8000)).body.time));
  const ts = String(Date.now() + off);
  const query = toQuery(params);
  const body = method === 'POST' ? JSON.stringify(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))) : '';
  const sign = hmacHex(`${ts}${key}${RECV}${method === 'GET' ? query : body}`, secret);
  const res = await fetchJson<Envelope<T>>(`${base(k.env)}${path}${method === 'GET' && query ? `?${query}` : ''}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-BAPI-API-KEY': key, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': RECV, 'X-BAPI-SIGN': sign }, body: method === 'POST' ? body : undefined,
  });
  if (!res.ok || res.body.retCode !== 0) fail(res.body.retCode, res.body.retMsg, res.status);
  return res.body.result;
}

const IGNORE = [110043, 110026, 3400045, 34036];
async function tolerant(run: () => Promise<unknown>) {
  try { await run(); } catch (e) { if (e instanceof ExchangeError && (IGNORE.includes(Number(e.code)) || /not modified/i.test(e.message))) return; throw e; }
}

export const bybit: Exchange = {
  id: 'bybit', label: 'Bybit', needsPassphrase: false, hasTestnet: true, testnetLabel: 'Testnet',
  keyHint: 'Bybit → API Management → izin Contract Trade saja (tanpa Withdraw).',
  async account(k) {
    const r = await signed<{ list?: Array<{ totalEquity?: string; totalAvailableBalance?: string; coin?: Array<{ coin: string; walletBalance: string }> }> }>(k, 'GET', '/v5/account/wallet-balance', { accountType: 'UNIFIED' });
    const w = r.list?.[0];
    return { equity: w?.totalEquity || '0', available: w?.totalAvailableBalance || '0', walletBalance: w?.coin?.find((c) => c.coin === 'USDT')?.walletBalance || '0' };
  },
  async positions(k) {
    const r = await signed<{ list?: Array<Record<string, string>> }>(k, 'GET', '/v5/position/list', { category: 'linear', settleCoin: 'USDT', limit: 50 });
    return (r.list || []).filter((p) => Number(p.size) > 0).map((p): Position => ({ symbol: p.symbol, side: p.side === 'Sell' ? 'SHORT' : 'LONG', size: p.size, avgPrice: p.avgPrice, markPrice: p.markPrice, unrealisedPnl: p.unrealisedPnl, leverage: p.leverage, stopLoss: p.stopLoss, takeProfit: p.takeProfit, liqPrice: p.liqPrice, idx: p.positionIdx, marginMode: p.tradeMode === '1' ? 'isolated' : 'cross' }));
  },
  async instrument(env, symbol): Promise<Instrument> {
    const r = await pub<{ list?: Array<{ symbol: string; status?: string; priceFilter: { tickSize: string }; lotSizeFilter: { qtyStep: string; minOrderQty: string; maxMktOrderQty?: string; maxOrderQty?: string; minNotionalValue?: string }; leverageFilter: { maxLeverage: string } }> }>(env, '/v5/market/instruments-info', { category: 'linear', symbol: normalizeSymbol(symbol) });
    const i = r.list?.[0];
    if (!i) throw new Error(`Symbol ${symbol} tidak ada di Bybit linear.`);
    if (i.status && i.status !== 'Trading') throw new Error(`${symbol} sedang tidak diperdagangkan (${i.status}).`);
    return { symbol: i.symbol, tickSize: i.priceFilter.tickSize, qtyStep: i.lotSizeFilter.qtyStep, minQty: i.lotSizeFilter.minOrderQty, maxQty: i.lotSizeFilter.maxMktOrderQty || i.lotSizeFilter.maxOrderQty || '1000000000', maxLeverage: Number(i.leverageFilter.maxLeverage) || 1, minNotional: Number(i.lotSizeFilter.minNotionalValue) || 5 };
  },
  async lastPrice(env, symbol) {
    const r = await pub<{ list?: Array<{ lastPrice: string }> }>(env, '/v5/market/tickers', { category: 'linear', symbol: normalizeSymbol(symbol) });
    const p = Number(r.list?.[0]?.lastPrice);
    if (!p) throw new Error(`Harga ${symbol} tidak tersedia di Bybit.`);
    return p;
  },
  async tickers(env, symbols): Promise<MarketTicker[]> {
    const r = await pub<{ list?: Array<{ symbol: string; lastPrice: string; price24hPcnt: string; turnover24h?: string }> }>(env, '/v5/market/tickers', { category: 'linear' });
    const want = new Set(symbols.map(normalizeSymbol));
    return (r.list || []).filter((t) => want.has(t.symbol)).map((t) => ({ symbol: t.symbol, last: Number(t.lastPrice), change24h: Number(t.price24hPcnt), volume24h: Number(t.turnover24h) || undefined }));
  },
  async marketTickers(env): Promise<MarketTicker[]> {
    const r = await pub<{ list?: Array<{ symbol: string; lastPrice: string; price24hPcnt: string; turnover24h?: string }> }>(env, '/v5/market/tickers', { category: 'linear' });
    return (r.list || []).filter((t) => /^[A-Z0-9]+USDT$/.test(t.symbol) && Number(t.lastPrice) > 0).map((t) => ({ symbol: t.symbol, last: Number(t.lastPrice), change24h: Number(t.price24hPcnt), volume24h: Number(t.turnover24h) || undefined }));
  },
  async submit(k, plan: OrderPlan) {
    await tolerant(() => signed(k, 'POST', '/v5/account/set-margin-mode', { setMarginMode: plan.marginMode === 'Cross' ? 'REGULAR_MARGIN' : 'ISOLATED_MARGIN' }));
    await tolerant(() => signed(k, 'POST', '/v5/position/set-leverage', { category: 'linear', symbol: plan.symbol, buyLeverage: String(plan.leverage), sellLeverage: String(plan.leverage) }));
    const r = await signed<{ orderId: string }>(k, 'POST', '/v5/order/create', { category: 'linear', symbol: plan.symbol, side: plan.side, orderType: 'Market', qty: plan.qty, positionIdx: 0, orderLinkId: `xo-${Date.now()}`, takeProfit: Number(plan.takeProfit) > 0 ? plan.takeProfit : undefined, stopLoss: plan.stopLoss, tpslMode: 'Full', tpTriggerBy: Number(plan.takeProfit) > 0 ? 'MarkPrice' : undefined, slTriggerBy: 'MarkPrice' });
    return { orderId: r.orderId };
  },
  async closePosition(k, pos, qty) {
    const r = await signed<{ orderId: string }>(k, 'POST', '/v5/order/create', { category: 'linear', symbol: pos.symbol, side: pos.side === 'LONG' ? 'Sell' : 'Buy', orderType: 'Market', qty: qty || pos.size, reduceOnly: true, positionIdx: Number(pos.idx || 0), orderLinkId: `xo-c-${Date.now()}` });
    return { orderId: r.orderId };
  },
  async setTpSl(k, pos, v: TpSl) {
    if (!v.takeProfit && !v.stopLoss) return;
    await tolerant(() => signed(k, 'POST', '/v5/position/trading-stop', { category: 'linear', symbol: pos.symbol, positionIdx: Number(pos.idx || 0), tpslMode: 'Full', takeProfit: v.takeProfit || undefined, stopLoss: v.stopLoss || undefined, tpTriggerBy: v.takeProfit ? 'MarkPrice' : undefined, slTriggerBy: v.stopLoss ? 'MarkPrice' : undefined }));
  },
  async openOrders(k): Promise<OpenOrder[]> {
    const r = await signed<{ list?: Array<Record<string, string | boolean>> }>(k, 'GET', '/v5/order/realtime', { category: 'linear', settleCoin: 'USDT', limit: 50 });
    return (r.list || []).map((o): OpenOrder => ({ id: String(o.orderId), symbol: String(o.symbol), side: o.side === 'Sell' ? 'Sell' : 'Buy', type: String(o.orderType || 'Limit'), price: Number(o.price) || 0, qty: Number(o.qty) || 0, reduceOnly: o.reduceOnly === true || o.reduceOnly === 'true', trigger: Number(o.triggerPrice) || undefined, createdAt: Number(o.createdTime) || undefined }));
  },
  async cancelOrder(k, order) { await signed(k, 'POST', '/v5/order/cancel', { category: 'linear', symbol: order.symbol, orderId: order.id }); },
  async setLeverage(k, pos, leverage) { await tolerant(() => signed(k, 'POST', '/v5/position/set-leverage', { category: 'linear', symbol: pos.symbol, buyLeverage: String(leverage), sellLeverage: String(leverage) })); },
  async closedTrades(k): Promise<ClosedTrade[]> {
    const r = await signed<{ list?: Array<Record<string, string>> }>(k, 'GET', '/v5/position/closed-pnl', { category: 'linear', limit: 50 });
    return (r.list || []).map((x): ClosedTrade => ({ symbol: x.symbol, side: x.side === 'Sell' ? 'LONG' : 'SHORT', pnl: Number(x.closedPnl) || 0, entry: Number(x.avgEntryPrice) || undefined, exit: Number(x.avgExitPrice) || undefined, qty: Number(x.qty) || undefined, closedAt: Number(x.updatedTime || x.createdTime) || 0 }));
  },
  async orderBook(env, symbol): Promise<OrderBook> {
    const r = await pub<{ b?: string[][]; a?: string[][] }>(env, '/v5/market/orderbook', { category: 'linear', symbol: normalizeSymbol(symbol), limit: 20 });
    const lv = (rows?: string[][]) => (rows || []).map((x) => ({ price: Number(x[0]), qty: Number(x[1]) }));
    return { bids: lv(r.b), asks: lv(r.a) };
  },
  async recentTrades(env, symbol): Promise<PublicTrade[]> {
    const r = await pub<{ list?: Array<Record<string, string>> }>(env, '/v5/market/recent-trade', { category: 'linear', symbol: normalizeSymbol(symbol), limit: 30 });
    return (r.list || []).map((x): PublicTrade => ({ t: Number(x.time), price: Number(x.price), qty: Number(x.size), side: x.side === 'Sell' ? 'Sell' : 'Buy' }));
  },
  async candles(env, symbol, since, interval): Promise<Candle[]> {
    const step = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '12h': '720', '1d': 'D', '1w': 'W' }[interval];
    const r = await pub<{ list?: string[][] }>(env, '/v5/market/kline', { category: 'linear', symbol: normalizeSymbol(symbol), interval: step, start: since, limit: 1000 });
    return (r.list || []).map((c) => ({ t: Number(c[0]), o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v: Number(c[5]) || 0 })).sort((a, b) => a.t - b.t);
  },
};
