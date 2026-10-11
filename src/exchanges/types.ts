import type { Candle, MarginMode } from '../domain';
export type { Candle, MarginMode } from '../domain';

export type ExchangeId = 'bybit' | 'bitget' | 'okx' | 'binance';
export type Env = 'mainnet' | 'testnet';

export type ExchangeKeys = { apiKey: string; apiSecret: string; passphrase: string; env: Env };
export type Account = { equity: string; available: string; walletBalance: string };
export type Position = { symbol: string; side: 'LONG' | 'SHORT'; size: string; avgPrice: string; markPrice?: string; unrealisedPnl: string; leverage: string; stopLoss?: string; takeProfit?: string; liqPrice?: string; /** exchange-specific hedge/position index */ idx?: string; marginMode?: 'cross' | 'isolated' };
export type Instrument = { symbol: string; tickSize: string; qtyStep: string; minQty: string; maxQty: string; maxLeverage: number; minNotional: number };
export type TpSl = { takeProfit?: string; stopLoss?: string };
export type MarketTicker = { symbol: string; last: number; change24h: number; volume24h?: number };
export type CandleInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '12h' | '1d' | '1w';
export type OpenOrder = { id: string; symbol: string; side: 'Buy' | 'Sell'; type: string; price: number; qty: number; reduceOnly: boolean; trigger?: number; createdAt?: number };
export type ClosedTrade = { symbol: string; side?: 'LONG' | 'SHORT'; pnl: number; entry?: number; exit?: number; qty?: number; closedAt: number };
export type BookLevel = { price: number; qty: number };
export type OrderBook = { bids: BookLevel[]; asks: BookLevel[] };
export type PublicTrade = { t: number; price: number; qty: number; side: 'Buy' | 'Sell' };

export type OrderPlan = {
  exchange: ExchangeId; symbol: string; side: 'Buy' | 'Sell'; qty: string; leverage: number; marginMode: MarginMode;
  takeProfit: string; stopLoss: string; lastPrice: number; notional: number; margin: number; maxLoss: number; warnings: string[];
};

export interface Exchange {
  id: ExchangeId;
  label: string;
  needsPassphrase: boolean;
  hasTestnet: boolean;
  testnetLabel: string;
  keyHint: string;
  account(keys: ExchangeKeys): Promise<Account>;
  positions(keys: ExchangeKeys): Promise<Position[]>;
  instrument(env: Env, symbol: string): Promise<Instrument>;
  lastPrice(env: Env, symbol: string): Promise<number>;
  tickers(env: Env, symbols: string[]): Promise<MarketTicker[]>;
  /** Public 24h market for the exchange's active USDT perpetual contracts. */
  marketTickers(env: Env): Promise<MarketTicker[]>;
  submit(keys: ExchangeKeys, plan: OrderPlan): Promise<{ orderId: string; warning?: string }>;
  /** Market reduce-only close. qty (base units) omitted = close the whole position. */
  closePosition(keys: ExchangeKeys, position: Position, qty?: string): Promise<{ orderId?: string }>;
  /** Replaces TP/SL of an open position. undefined/'' = keep, '0' = remove. */
  setTpSl(keys: ExchangeKeys, position: Position, tpsl: TpSl): Promise<void>;
  /** Resting (not yet filled) orders. */
  openOrders(keys: ExchangeKeys): Promise<OpenOrder[]>;
  cancelOrder(keys: ExchangeKeys, order: OpenOrder): Promise<void>;
  /** Changes leverage of an existing position (exchange rejects it when it would break margin rules). */
  setLeverage(keys: ExchangeKeys, position: Position, leverage: number): Promise<void>;
  /** Recent realised PnL, newest first. */
  closedTrades(keys: ExchangeKeys): Promise<ClosedTrade[]>;
  orderBook(env: Env, symbol: string): Promise<OrderBook>;
  recentTrades(env: Env, symbol: string): Promise<PublicTrade[]>;
  /** Public candles (oldest first) from `since` ms; used to replay signals. */
  candles(env: Env, symbol: string, since: number, interval: CandleInterval): Promise<Candle[]>;
}

export class ExchangeError extends Error {
  code: string;
  constructor(exchange: string, code: string | number, message: string) {
    super(`${exchange}${code ? ` ${code}` : ''}: ${message}`);
    this.code = String(code);
  }
}

export function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/PERP$/, '').replace(/USDTP$/, 'USDT');
}
export function baseOf(symbol: string): string { return normalizeSymbol(symbol).replace(/USDT$/, ''); }
