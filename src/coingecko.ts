import { fetchJson } from './http';
import type { Candle } from './domain';

const BASE = 'https://api.coingecko.com/api/v3';
let demoKey = '';
/** Optional CoinGecko Demo API key (free to create) for a much higher rate limit than anonymous access. */
export const setCoinGeckoKey = (key: string): void => { demoKey = key.trim(); };
export type CoinGeckoCoin = { id: string; name: string; symbol: string; slug: string; rank: number; price: number; ch1h: number; ch24h: number; ch7d: number; marketCap: number; volume24h: number; supply?: number; maxSupply?: number | null; tags?: string[]; image?: string };
export type CoinGeckoGlobal = { marketCap: number; marketCapChange24h: number; volume24h: number; btcDominance: number; ethDominance: number; activeCoins: number };
export type CoinGeckoInfo = { description?: string; website?: string[]; twitter?: string[]; reddit?: string[]; category?: string; tags?: string[]; logo?: string };
export type CoinGeckoSort = 'market_cap' | 'volume_24h' | 'percent_change_24h_desc' | 'percent_change_24h_asc';
export type CoinGeckoTicker = { symbol: string; baseSymbol: string; last: number; change24h: number; updatedAt: number };
export type CoinGeckoChartRange = '24h' | '7d' | '14d' | '30d' | '90d' | '180d' | '365d';
export type CoinGeckoPriceSample = { t: number; price: number };

export class CoinGeckoError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = 'CoinGeckoError'; this.status = status; }
}

type CacheValue = { at: number; data: unknown };
const cache = new Map<string, CacheValue>();
const priceSamples = new Map<string, CoinGeckoPriceSample[]>();
const symbolIds = new Map<string, string>([
  ['BTC', 'bitcoin'], ['ETH', 'ethereum'], ['SOL', 'solana'], ['XRP', 'ripple'], ['BNB', 'binancecoin'],
  ['DOGE', 'dogecoin'], ['ADA', 'cardano'], ['TRX', 'tron'], ['TON', 'the-open-network'], ['AVAX', 'avalanche-2'],
  ['LINK', 'chainlink'], ['DOT', 'polkadot'], ['LTC', 'litecoin'], ['BCH', 'bitcoin-cash'], ['SHIB', 'shiba-inu'],
  ['SUI', 'sui'], ['NEAR', 'near'], ['APT', 'aptos'], ['ARB', 'arbitrum'], ['OP', 'optimism'], ['UNI', 'uniswap'],
  ['ATOM', 'cosmos'], ['XLM', 'stellar'], ['ETC', 'ethereum-classic'], ['FIL', 'filecoin'], ['ICP', 'internet-computer'],
  ['HBAR', 'hedera-hashgraph'], ['INJ', 'injective-protocol'], ['AAVE', 'aave'], ['PEPE', 'pepe'], ['WIF', 'dogwifcoin'],
  ['USDT', 'tether'], ['USDC', 'usd-coin'], ['DAI', 'dai'], ['FDUSD', 'first-digital-usd'],
]);
const searchInFlight = new Map<string, Promise<string | undefined>>();

function queryString(query: Record<string, string | number | boolean>): string {
  return Object.keys(query).map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`).join('&');
}
async function get<T>(path: string, query: Record<string, string | number | boolean>, ttlMs: number, force = false): Promise<T> {
  const qs = queryString(query);
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const res = await fetchJson<unknown>(url, { headers: demoKey ? { Accept: 'application/json', 'x-cg-demo-api-key': demoKey } : { Accept: 'application/json' } }, 20000);
  if (!res.ok) {
    const body = res.body as { error?: unknown; status?: { error_message?: string } };
    const detail = typeof body?.error === 'string' ? body.error : body?.status?.error_message;
    const message = res.status === 429 ? 'Batas request CoinGecko tercapai. Tunggu sebentar lalu coba lagi.'
      : res.status === 403 ? 'Akses CoinGecko ditolak. Periksa koneksi atau coba lagi nanti.'
        : detail || `CoinGecko HTTP ${res.status}`;
    throw new CoinGeckoError(res.status, message);
  }
  cache.set(url, { at: Date.now(), data: res.body });
  return res.body as T;
}
export const clearCoinGeckoCache = () => cache.clear();

function baseSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/PERP$/, '').replace(/(USDT|USDC|BUSD|USD)$/, '');
}
function pairSymbol(symbol: string): string { return `${baseSymbol(symbol)}USDT`; }

type RawMarket = {
  id: string; name: string; symbol: string; market_cap_rank?: number | null; current_price?: number | null;
  price_change_percentage_1h_in_currency?: number | null; price_change_percentage_24h?: number | null; price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null; market_cap?: number | null; total_volume?: number | null;
  circulating_supply?: number | null; max_supply?: number | null; image?: string; last_updated?: string;
};
export function mapCoin(c: RawMarket): CoinGeckoCoin {
  const symbol = String(c.symbol || '').toUpperCase();
  const coin = {
    id: c.id, name: c.name, symbol, slug: c.id, rank: Number(c.market_cap_rank) || 0, price: Number(c.current_price) || 0,
    ch1h: Number(c.price_change_percentage_1h_in_currency) || 0,
    ch24h: Number(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h) || 0,
    ch7d: Number(c.price_change_percentage_7d_in_currency) || 0,
    marketCap: Number(c.market_cap) || 0, volume24h: Number(c.total_volume) || 0,
    supply: Number(c.circulating_supply) || undefined, maxSupply: c.max_supply, image: c.image,
  };
  if (coin.id && symbol) symbolIds.set(symbol, coin.id);
  return coin;
}

export async function coinGeckoListings(sort: CoinGeckoSort = 'market_cap', limit = 50, force = false): Promise<CoinGeckoCoin[]> {
  const order = sort === 'volume_24h' ? 'volume_desc' : 'market_cap_desc';
  const raw = await get<RawMarket[]>('/coins/markets', { vs_currency: 'usd', order, per_page: 100, page: 1, sparkline: false, price_change_percentage: '1h,24h,7d' }, 120000, force);
  let coins = (raw || []).map(mapCoin);
  if (sort === 'percent_change_24h_desc') coins = coins.filter((c) => c.volume24h > 1e6).sort((a, b) => b.ch24h - a.ch24h);
  if (sort === 'percent_change_24h_asc') coins = coins.filter((c) => c.volume24h > 1e6).sort((a, b) => a.ch24h - b.ch24h);
  return coins.slice(0, limit);
}

/** Top coins by market cap (up to 250) used for icons and the CoinGecko pair list. */
export async function coinGeckoUniverse(force = false): Promise<CoinGeckoCoin[]> {
  const raw = await get<RawMarket[]>('/coins/markets', { vs_currency: 'usd', order: 'market_cap_desc', per_page: 250, page: 1, sparkline: false, price_change_percentage: '24h' }, 180000, force);
  return (raw || []).map(mapCoin);
}
/** Base tickers that belong to a CoinGecko category (e.g. 'meme-token'). */
export async function coinGeckoCategoryMembers(categoryId: string, force = false): Promise<string[]> {
  const raw = await get<RawMarket[]>('/coins/markets', { vs_currency: 'usd', category: categoryId, order: 'market_cap_desc', per_page: 100, page: 1, sparkline: false }, 600000, force);
  return Array.from(new Set((raw || []).map((c) => String(c.symbol || '').toUpperCase()).filter(Boolean)));
}

export async function coinGeckoGlobal(force = false): Promise<CoinGeckoGlobal> {
  const response = await get<{ data?: { active_cryptocurrencies?: number; total_market_cap?: { usd?: number }; total_volume?: { usd?: number }; market_cap_change_percentage_24h_usd?: number; market_cap_percentage?: { btc?: number; eth?: number } } }>('/global', {}, 120000, force);
  const d = response.data || {};
  return { marketCap: Number(d.total_market_cap?.usd) || 0, marketCapChange24h: Number(d.market_cap_change_percentage_24h_usd) || 0, volume24h: Number(d.total_volume?.usd) || 0, btcDominance: Number(d.market_cap_percentage?.btc) || 0, ethDominance: Number(d.market_cap_percentage?.eth) || 0, activeCoins: Number(d.active_cryptocurrencies) || 0 };
}

type TrendingResponse = { coins?: Array<{ item?: { id?: string; name?: string; symbol?: string; market_cap_rank?: number; data?: { price?: number; price_change_percentage_24h?: { usd?: number }; market_cap?: string; total_volume?: string } } }> };
function parseCompactNumber(value?: string): number {
  const match = String(value || '').replace(/[$,\s]/g, '').match(/^(-?[\d.]+)([KMBT])?$/i);
  if (!match) return 0;
  const multiplier: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  return Number(match[1]) * (multiplier[(match[2] || '').toUpperCase()] || 1);
}
export async function coinGeckoTrending(force = false): Promise<CoinGeckoCoin[]> {
  const response = await get<TrendingResponse>('/search/trending', {}, 300000, force);
  return (response.coins || []).flatMap(({ item }) => {
    if (!item?.id) return [];
    const raw: RawMarket = {
      id: item.id, name: item.name || item.id, symbol: item.symbol || '', market_cap_rank: item.market_cap_rank,
      current_price: item.data?.price, price_change_percentage_24h: item.data?.price_change_percentage_24h?.usd,
      market_cap: parseCompactNumber(item.data?.market_cap), total_volume: parseCompactNumber(item.data?.total_volume),
    };
    return [mapCoin(raw)];
  });
}

export async function coinGeckoCoinDetail(id: string, force = false): Promise<{ coin: CoinGeckoCoin; info: CoinGeckoInfo }> {
  const encoded = encodeURIComponent(id);
  const raw = await get<{
    id: string; name: string; symbol: string; market_cap_rank?: number;
    categories?: string[]; description?: { en?: string }; links?: { homepage?: string[]; twitter_screen_name?: string; subreddit_url?: string };
    image?: { thumb?: string; small?: string; large?: string }; market_data?: {
      current_price?: { usd?: number }; market_cap?: { usd?: number }; total_volume?: { usd?: number }; circulating_supply?: number; max_supply?: number | null;
      market_cap_rank?: number; price_change_percentage_1h_in_currency?: { usd?: number }; price_change_percentage_24h?: number;
      price_change_percentage_24h_in_currency?: { usd?: number }; price_change_percentage_7d_in_currency?: { usd?: number };
    };
  }>(`/coins/${encoded}`, { localization: false, tickers: false, market_data: true, community_data: false, developer_data: false, sparkline: false }, 600000, force);
  const m = raw.market_data || {};
  const coin = mapCoin({
    id: raw.id, name: raw.name, symbol: raw.symbol, market_cap_rank: m.market_cap_rank || raw.market_cap_rank,
    current_price: m.current_price?.usd, price_change_percentage_1h_in_currency: m.price_change_percentage_1h_in_currency?.usd,
    price_change_percentage_24h: m.price_change_percentage_24h, price_change_percentage_24h_in_currency: m.price_change_percentage_24h_in_currency?.usd,
    price_change_percentage_7d_in_currency: m.price_change_percentage_7d_in_currency?.usd, market_cap: m.market_cap?.usd,
    total_volume: m.total_volume?.usd, circulating_supply: m.circulating_supply, max_supply: m.max_supply, image: raw.image?.large,
  });
  const homepage = (raw.links?.homepage || []).filter(Boolean);
  const twitter = raw.links?.twitter_screen_name ? [`https://x.com/${raw.links.twitter_screen_name}`] : [];
  const reddit = raw.links?.subreddit_url ? [raw.links.subreddit_url] : [];
  const categories = (raw.categories || []).filter(Boolean);
  return { coin, info: { description: raw.description?.en, website: homepage, twitter, reddit, category: categories[0], tags: categories.slice(1, 8), logo: raw.image?.large } };
}

type SearchResponse = { coins?: Array<{ id: string; name: string; symbol: string; market_cap_rank?: number | null }> };
async function coinIdForSymbol(rawSymbol: string): Promise<string | undefined> {
  const symbol = baseSymbol(rawSymbol);
  if (!symbol) return undefined;
  const known = symbolIds.get(symbol);
  if (known) return known;
  const pending = searchInFlight.get(symbol);
  if (pending) return pending;
  const request = (async () => {
    try {
      const response = await get<SearchResponse>('/search', { query: symbol }, 21600000);
      const matches = (response.coins || []).filter((c) => c.symbol?.toUpperCase() === symbol);
      const best = (matches.length ? matches : response.coins || []).slice().sort((a, b) => (a.market_cap_rank || Number.MAX_SAFE_INTEGER) - (b.market_cap_rank || Number.MAX_SAFE_INTEGER))[0];
      if (best?.id) { symbolIds.set(symbol, best.id); return best.id; }
    } catch { /* The caller reports a missing quote; a later refresh may retry. */ }
    return undefined;
  })();
  searchInFlight.set(symbol, request);
  const result = await request;
  searchInFlight.delete(symbol);
  return result;
}

type SimplePrice = Record<string, { usd?: number; usd_24h_change?: number; last_updated_at?: number }>;
export async function coinGeckoLivePrices(symbols: string[], force = false): Promise<CoinGeckoTicker[]> {
  const entries = await Promise.all(Array.from(new Set(symbols.map((s) => baseSymbol(s)).filter(Boolean))).map(async (symbol) => ({ symbol, id: await coinIdForSymbol(symbol) })));
  const resolved = entries.filter((x): x is { symbol: string; id: string } => Boolean(x.id));
  if (!resolved.length) return [];
  const ids = Array.from(new Set(resolved.map((x) => x.id))).join(',');
  const data = await get<SimplePrice>('/simple/price', { ids, vs_currencies: 'usd', include_24hr_change: true, include_last_updated_at: true }, 60000, force);
  const now = Date.now();
  return resolved.flatMap(({ symbol, id }) => {
    const quote = data[id]; const last = Number(quote?.usd);
    if (!(last > 0)) return [];
    const pair = `${symbol}USDT`;
    const updatedAt = (Number(quote?.last_updated_at) || 0) * 1000 || now;
    const samples = priceSamples.get(pair) || [];
    const prior = samples[samples.length - 1];
    if (!prior || prior.t !== updatedAt || prior.price !== last) priceSamples.set(pair, [...samples, { t: updatedAt, price: last }].slice(-1500));
    return [{ symbol: pair, baseSymbol: symbol, last, change24h: Number(quote?.usd_24h_change || 0) / 100, updatedAt }];
  });
}

export function coinGeckoPriceHistory(symbol: string, range: '1h' | '24h' | '7d' = '24h'): CoinGeckoPriceSample[] {
  const from = Date.now() - (range === '1h' ? 3600000 : range === '7d' ? 7 * 86400000 : 86400000);
  return (priceSamples.get(pairSymbol(symbol)) || []).filter((point) => point.t >= from);
}

export function mapCoinGeckoCandles(data: unknown): Candle[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 5) return [];
    const [t, o, h, l, c] = point.map(Number);
    return Number.isFinite(t) && o > 0 && h > 0 && l > 0 && c > 0 ? [{ t, o, h, l, c }] : [];
  });
}

const chartDays: Record<CoinGeckoChartRange, string> = { '24h': '1', '7d': '7', '14d': '14', '30d': '30', '90d': '90', '180d': '180', '365d': '365' };
export async function coinGeckoCandles(symbol: string, range: CoinGeckoChartRange, force = false): Promise<Candle[]> {
  const id = await coinIdForSymbol(symbol);
  if (!id) throw new CoinGeckoError(404, `CoinGecko tidak menemukan aset ${baseSymbol(symbol)}.`);
  const data = await get<unknown>(`/coins/${encodeURIComponent(id)}/ohlc`, { vs_currency: 'usd', days: chartDays[range] }, 900000, force);
  return mapCoinGeckoCandles(data);
}

export async function coinGeckoHistoricalCandles(symbol: string, since: number, force = false): Promise<Candle[]> {
  const id = await coinIdForSymbol(symbol);
  if (!id) throw new CoinGeckoError(404, `CoinGecko tidak menemukan aset ${baseSymbol(symbol)}.`);
  const elapsedDays = Math.max(1, Math.ceil((Date.now() - since) / 86400000));
  const days = ['1', '7', '14', '30', '90', '180', '365'].find((d) => Number(d) >= elapsedDays) || '365';
  const data = await get<unknown>(`/coins/${encodeURIComponent(id)}/ohlc`, { vs_currency: 'usd', days }, 900000, force);
  return mapCoinGeckoCandles(data).filter((candle) => candle.t >= since);
}

export const compactUsd = (n: number): string => { const a = Math.abs(n); return a >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : a >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`; };
