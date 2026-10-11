import { bybit } from './bybit';
import { bitget } from './bitget';
import { okx } from './okx';
import { binance } from './binance';
import type { Exchange, ExchangeId } from './types';

export const EXCHANGES: Record<ExchangeId, Exchange> = { bybit, bitget, okx, binance };
export const EXCHANGE_LIST: Exchange[] = [bitget, bybit, okx, binance];
export const getExchange = (id: ExchangeId): Exchange => EXCHANGES[id] || bitget;
export * from './types';
export { planManualOrder, planOrder } from './planner';
