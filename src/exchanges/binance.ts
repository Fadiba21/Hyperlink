import { fetchJson, clockOffset, hmacHex, toQuery, type Params } from './util';
import { ExchangeError, normalizeSymbol, type Candle, type ClosedTrade, type OpenOrder, type OrderBook, type PublicTrade, type Env, type Exchange, type ExchangeKeys, type Instrument, type MarketTicker, type OrderPlan, type Position, type TpSl } from './types';

const base = (env: Env) => (env === 'mainnet' ? 'https://fapi.binance.com' : 'https://testnet.binancefuture.com');

function fail(code: number | undefined, msg: string | undefined, status: number): never {
  let m = msg || `HTTP ${status}`;
  if (status === 451 || status === 403) m = `Binance memblokir wilayah/IP ini (HTTP ${status}). Gunakan koneksi yang diizinkan atau pilih exchange lain.`;
  if (code === -1021) m += ` · ${'Jam HP mungkin tidak akurat: aktifkan "Waktu otomatis".'}`;
  if (code === -2015) m += ' · Periksa API key, izin Futures, IP whitelist, dan apakah key ini untuk Testnet/Mainnet yang dipilih.';
  throw new ExchangeError('Binance', code ?? status, m);
}

async function call<T>(k: ExchangeKeys | null, env: Env, method: 'GET' | 'POST' | 'DELETE', path: string, params: Params = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let query = toQuery(params);
  if (k) {
    if (!k.apiKey.trim() || !k.apiSecret.trim()) throw new Error('Binance API Key dan Secret belum diisi.');
    const off = await clockOffset(`binance-${env}`, async () => Number((await fetchJson<{ serverTime: number }>(`${base(env)}/fapi/v1/time`, {}, 8000)).body.serverTime));
    query = toQuery({ ...params, recvWindow: 10000, timestamp: Date.now() + off });
    query += `&signature=${hmacHex(query, k.apiSecret.trim())}`;
    headers['X-MBX-APIKEY'] = k.apiKey.trim();
  }
  const res = await fetchJson<T & { code?: number; msg?: string }>(`${base(env)}${path}${query ? `?${query}` : ''}`, { method, headers });
  const b = res.body as { code?: number; msg?: string };
  if (!res.ok || (typeof b.code === 'number' && b.code < 0)) fail(b.code, b.msg, res.status);
  return res.body as T;
}

type Filter = { filterType: string; tickSize?: string; stepSize?: string; minQty?: string; maxQty?: string; notional?: string };
type Info = { symbols: Array<{ symbol: string; status: string; contractType: string; quoteAsset: string; filters: Filter[] }> };
const infoCache: Record<string, { at: number; data: Info }> = {};
async function exchangeInfo(env: Env): Promise<Info> {
  const c = infoCache[env];
  if (c && Date.now() - c.at < 30 * 60000) return c.data;
  const data = await call<Info>(null, env, 'GET', '/fapi/v1/exchangeInfo');
  infoCache[env] = { at: Date.now(), data };
  return data;
}

async function dual(k: ExchangeKeys): Promise<boolean> {
  const r = await call<{ dualSidePosition: boolean | string }>(k, k.env, 'GET', '/fapi/v1/positionSide/dual');
  return r.dualSidePosition === true || r.dualSidePosition === 'true';
}

type AlgoOrder = Record<string, string>;
const algoKind = (a: AlgoOrder) => String(a.orderType || a.type || '');
const algoTrigger = (a: AlgoOrder) => String(a.triggerPrice || a.stopPrice || '');
async function openAlgos(k: ExchangeKeys, symbol?: string): Promise<AlgoOrder[]> {
  try { const d = await call<AlgoOrder[] | { orders?: AlgoOrder[] }>(k, k.env, 'GET', '/fapi/v1/openAlgoOrders', { symbol }); return Array.isArray(d) ? d : d.orders || []; } catch { /* old endpoint */ }
  try { return await call<AlgoOrder[]>(k, k.env, 'GET', '/fapi/v1/openOrders', { symbol }); } catch { return []; }
}
async function algo(k: ExchangeKeys, plan: OrderPlan, type: 'STOP_MARKET' | 'TAKE_PROFIT_MARKET', trigger: string, hedge: boolean) {
  const closeSide = plan.side === 'Buy' ? 'SELL' : 'BUY';
  const positionSide = hedge ? (plan.side === 'Buy' ? 'LONG' : 'SHORT') : undefined;
  try {
    await call(k, k.env, 'POST', '/fapi/v1/algoOrder', { algoType: 'CONDITIONAL', symbol: plan.symbol, side: closeSide, type, triggerPrice: trigger, closePosition: 'true', workingType: 'MARK_PRICE', priceProtect: 'false', positionSide });
  } catch (e) {
    if (!(e instanceof ExchangeError && e.code === '404')) throw e;
    await call(k, k.env, 'POST', '/fapi/v1/order', { symbol: plan.symbol, side: closeSide, type, stopPrice: trigger, closePosition: 'true', workingType: 'MARK_PRICE', positionSide });
  }
}

export const binance: Exchange = {
  id: 'binance', label: 'Binance', needsPassphrase: false, hasTestnet: true, testnetLabel: 'Testnet',
  keyHint: 'Binance → API Management → aktifkan Enable Futures (tanpa Withdraw). Testnet: testnet.binancefuture.com.',
  async account(k) {
    let a: { totalMarginBalance?: string; totalWalletBalance?: string; availableBalance?: string };
    try { a = await call(k, k.env, 'GET', '/fapi/v3/account'); } catch (e) { if (e instanceof ExchangeError && e.code === '404') a = await call(k, k.env, 'GET', '/fapi/v2/account'); else throw e; }
    return { equity: a.totalMarginBalance || a.totalWalletBalance || '0', available: a.availableBalance || '0', walletBalance: a.totalWalletBalance || '0' };
  },
  async positions(k) {
    let d: Array<Record<string, string>>;
    try { d = await call(k, k.env, 'GET', '/fapi/v3/positionRisk'); } catch (e) { if (e instanceof ExchangeError && e.code === '404') d = await call(k, k.env, 'GET', '/fapi/v2/positionRisk'); else throw e; }
    const algos = await openAlgos(k);
    return d.filter((p) => Number(p.positionAmt) !== 0).map((p): Position => ({ symbol: p.symbol, side: p.positionSide === 'SHORT' || (p.positionSide !== 'LONG' && Number(p.positionAmt) < 0) ? 'SHORT' : 'LONG', size: String(Math.abs(Number(p.positionAmt))), avgPrice: p.entryPrice, markPrice: p.markPrice, unrealisedPnl: p.unRealizedProfit, leverage: p.leverage || '1', liqPrice: p.liquidationPrice, idx: p.positionSide || 'BOTH', marginMode: p.marginType === 'isolated' || String(p.isolated) === 'true' ? 'isolated' : 'cross' })).map((p) => { const mine = algos.filter((a) => a.symbol === p.symbol && (a.positionSide || 'BOTH') === (p.idx || 'BOTH') || (a.symbol === p.symbol && a.positionSide === 'BOTH' && p.idx === 'BOTH')); const sl = mine.find((a) => /^STOP/.test(algoKind(a))); const tp = mine.find((a) => /^TAKE_PROFIT/.test(algoKind(a))); return { ...p, stopLoss: sl ? algoTrigger(sl) : undefined, takeProfit: tp ? algoTrigger(tp) : undefined }; });
  },
  async instrument(env, symbol): Promise<Instrument> {
    const sym = normalizeSymbol(symbol);
    const s = (await exchangeInfo(env)).symbols.find((x) => x.symbol === sym && x.contractType === 'PERPETUAL');
    if (!s) throw new Error(`Pair ${sym} tidak ada di Binance USDⓈ-M perpetual.`);
    if (s.status !== 'TRADING') throw new Error(`${sym} sedang tidak diperdagangkan (${s.status}).`);
    const f = (t: string) => s.filters.find((x) => x.filterType === t);
    const lot = f('MARKET_LOT_SIZE') || f('LOT_SIZE');
    return { symbol: sym, tickSize: f('PRICE_FILTER')?.tickSize || '0.01', qtyStep: lot?.stepSize || '0.001', minQty: lot?.minQty || '0', maxQty: lot?.maxQty || '1000000000', maxLeverage: 125, minNotional: Number(f('MIN_NOTIONAL')?.notional) || 5 };
  },
  async lastPrice(env, symbol) {
    const d = await call<{ price: string }>(null, env, 'GET', '/fapi/v1/ticker/price', { symbol: normalizeSymbol(symbol) });
    const p = Number(d.price);
    if (!p) throw new Error(`Harga ${symbol} tidak tersedia di Binance.`);
    return p;
  },
  async tickers(env, symbols): Promise<MarketTicker[]> {
    const out: MarketTicker[] = [];
    await Promise.all(symbols.map(async (s) => {
      try { const d = await call<{ lastPrice: string; priceChangePercent: string }>(null, env, 'GET', '/fapi/v1/ticker/24hr', { symbol: normalizeSymbol(s) }); out.push({ symbol: normalizeSymbol(s), last: Number(d.lastPrice), change24h: Number(d.priceChangePercent) / 100 }); } catch { /* skip unknown pair */ }
    }));
    return out;
  },
  async marketTickers(env): Promise<MarketTicker[]> {
    const rows = await call<Array<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume?: string }>>(null, env, 'GET', '/fapi/v1/ticker/24hr');
    return rows.filter((t) => /^[A-Z0-9]+USDT$/.test(t.symbol) && Number(t.lastPrice) > 0).map((t) => ({ symbol: t.symbol, last: Number(t.lastPrice), change24h: Number(t.priceChangePercent) / 100, volume24h: Number(t.quoteVolume) || undefined }));
  },
  async submit(k, plan: OrderPlan) {
    const hedge = await dual(k);
    try { await call(k, k.env, 'POST', '/fapi/v1/marginType', { symbol: plan.symbol, marginType: plan.marginMode === 'Cross' ? 'CROSSED' : 'ISOLATED' }); }
    catch (e) { if (!(e instanceof ExchangeError && e.code === '-4046')) throw e; }
    await call(k, k.env, 'POST', '/fapi/v1/leverage', { symbol: plan.symbol, leverage: plan.leverage });
    const long = plan.side === 'Buy';
    const entry = await call<{ orderId: number | string }>(k, k.env, 'POST', '/fapi/v1/order', { symbol: plan.symbol, side: long ? 'BUY' : 'SELL', type: 'MARKET', quantity: plan.qty, positionSide: hedge ? (long ? 'LONG' : 'SHORT') : undefined, newClientOrderId: `xo${Date.now()}`, newOrderRespType: 'RESULT' });
    try {
      await algo(k, plan, 'STOP_MARKET', plan.stopLoss, hedge);
    } catch (slError) {
      try {
        await call(k, k.env, 'POST', '/fapi/v1/order', { symbol: plan.symbol, side: long ? 'SELL' : 'BUY', type: 'MARKET', quantity: plan.qty, reduceOnly: hedge ? undefined : 'true', positionSide: hedge ? (long ? 'LONG' : 'SHORT') : undefined });
      } catch {
        throw new Error(`PERINGATAN: posisi ${plan.symbol} terbuka TANPA stop loss dan gagal ditutup otomatis. Tutup/pasang SL manual di Binance SEKARANG. (${slError instanceof Error ? slError.message : ''})`);
      }
      throw new Error(`Stop loss gagal dipasang sehingga posisi ditutup otomatis demi keamanan. Penyebab: ${slError instanceof Error ? slError.message : 'tidak diketahui'}`);
    }
    if (Number(plan.takeProfit) > 0) {
      try { await algo(k, plan, 'TAKE_PROFIT_MARKET', plan.takeProfit, hedge); } catch (tpError) { return { orderId: String(entry.orderId), warning: `Entry & SL terpasang, tetapi Take Profit gagal: ${tpError instanceof Error ? tpError.message : ''}` }; }
    }
    return { orderId: String(entry.orderId) };
  },
  async closePosition(k, pos, qty) {
    const hedge = pos.idx === 'LONG' || pos.idx === 'SHORT';
    const r = await call<{ orderId: number | string }>(k, k.env, 'POST', '/fapi/v1/order', { symbol: pos.symbol, side: pos.side === 'LONG' ? 'SELL' : 'BUY', type: 'MARKET', quantity: qty || pos.size, reduceOnly: hedge ? undefined : 'true', positionSide: hedge ? pos.idx : undefined, newClientOrderId: `xoc${Date.now()}` });
    return { orderId: String(r.orderId) };
  },
  async setTpSl(k, pos, v: TpSl) {
    if (!v.takeProfit && !v.stopLoss) return;
    const hedge = pos.idx === 'LONG' || pos.idx === 'SHORT';
    const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
    const mine = (await openAlgos(k, pos.symbol)).filter((a) => a.side === closeSide && (!hedge || a.positionSide === pos.idx));
    const cancel = async (a: AlgoOrder) => { try { await call(k, k.env, 'DELETE', '/fapi/v1/algoOrder', { algoId: a.algoId }); } catch (e) { if (!a.orderId) throw e; await call(k, k.env, 'DELETE', '/fapi/v1/order', { symbol: pos.symbol, orderId: a.orderId }); } };
    const plan = { exchange: 'binance', symbol: pos.symbol, side: pos.side === 'LONG' ? 'Buy' : 'Sell' } as OrderPlan;
    if (v.stopLoss) {
      for (const a of mine.filter((x) => /^STOP/.test(algoKind(x)))) await cancel(a);
      if (v.stopLoss !== '0') await algo(k, plan, 'STOP_MARKET', v.stopLoss, hedge);
    }
    if (v.takeProfit) {
      for (const a of mine.filter((x) => /^TAKE_PROFIT/.test(algoKind(x)))) await cancel(a);
      if (v.takeProfit !== '0') await algo(k, plan, 'TAKE_PROFIT_MARKET', v.takeProfit, hedge);
    }
  },
  async openOrders(k): Promise<OpenOrder[]> {
    const d = await call<Array<Record<string, string | boolean | number>>>(k, k.env, 'GET', '/fapi/v1/openOrders');
    return d.map((o): OpenOrder => ({ id: String(o.orderId), symbol: String(o.symbol), side: o.side === 'SELL' ? 'Sell' : 'Buy', type: String(o.type || 'LIMIT'), price: Number(o.price) || 0, qty: Number(o.origQty) || 0, reduceOnly: o.reduceOnly === true, trigger: Number(o.stopPrice) || undefined, createdAt: Number(o.time) || undefined }));
  },
  async cancelOrder(k, order) { await call(k, k.env, 'DELETE', '/fapi/v1/order', { symbol: order.symbol, orderId: order.id }); },
  async setLeverage(k, pos, leverage) { await call(k, k.env, 'POST', '/fapi/v1/leverage', { symbol: pos.symbol, leverage }); },
  async closedTrades(k): Promise<ClosedTrade[]> {
    const d = await call<Array<Record<string, string>>>(k, k.env, 'GET', '/fapi/v1/income', { incomeType: 'REALIZED_PNL', limit: 50 });
    return d.map((x): ClosedTrade => ({ symbol: x.symbol, pnl: Number(x.income) || 0, closedAt: Number(x.time) || 0 })).sort((a, b) => b.closedAt - a.closedAt);
  },
  async orderBook(env, symbol): Promise<OrderBook> {
    const d = await call<{ bids?: string[][]; asks?: string[][] }>(null, env, 'GET', '/fapi/v1/depth', { symbol: normalizeSymbol(symbol), limit: 20 });
    const lv = (rows?: string[][]) => (rows || []).map((x) => ({ price: Number(x[0]), qty: Number(x[1]) }));
    return { bids: lv(d.bids), asks: lv(d.asks) };
  },
  async recentTrades(env, symbol): Promise<PublicTrade[]> {
    const d = await call<Array<Record<string, string | number | boolean>>>(null, env, 'GET', '/fapi/v1/trades', { symbol: normalizeSymbol(symbol), limit: 30 });
    return d.map((x): PublicTrade => ({ t: Number(x.time), price: Number(x.price), qty: Number(x.qty), side: x.isBuyerMaker ? 'Sell' : 'Buy' })).reverse();
  },
  async candles(env, symbol, since, interval): Promise<Candle[]> {
    const d = await call<Array<Array<string | number>>>(null, env, 'GET', '/fapi/v1/klines', { symbol: normalizeSymbol(symbol), interval, startTime: since, limit: 1500 });
    return d.map((c) => ({ t: Number(c[0]), o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v: Number(c[5]) || 0 }));
  },
};
