import { planManualOrder } from '../src/exchanges/planner';
import type { Exchange, ExchangeKeys, Instrument } from '../src/exchanges/types';

const instrument: Instrument = { symbol: 'BTCUSDT', tickSize: '0.1', qtyStep: '0.001', minQty: '0.001', maxQty: '10', maxLeverage: 25, minNotional: 5 };
const exchange = {
  id: 'bybit', label: 'Bybit', instrument: jest.fn(async () => instrument), lastPrice: jest.fn(async () => 60000),
} as unknown as Exchange;
const keys: ExchangeKeys = { apiKey: '', apiSecret: '', passphrase: '', env: 'testnet' };
const base = { symbol: 'BTCUSDT', side: 'Buy' as const, quantity: 0.0129, leverage: 10, marginMode: 'Isolated' as const, stopLoss: 59000, takeProfit: 62000, available: 1000 };

beforeEach(() => { jest.clearAllMocks(); });

describe('Live manual order planner', () => {
  it('uses the selected exchange instrument step, market price, and native TP/SL prices', async () => {
    const plan = await planManualOrder(exchange, keys, base);
    expect(plan.exchange).toBe('bybit');
    expect(plan.symbol).toBe('BTCUSDT');
    expect(plan.qty).toBe('0.012');
    expect(plan.lastPrice).toBe(60000);
    expect(plan.stopLoss).toBe('59000.0');
    expect(plan.takeProfit).toBe('62000.0');
    expect(plan.margin).toBeCloseTo(72);
    expect(plan.warnings).toContain('Qty dibulatkan turun mengikuti step pair 0.001.');
    expect(exchange.instrument).toHaveBeenCalledWith('testnet', 'BTCUSDT');
  });

  it('allows no TP but records zero so exchange adapters omit an optional TP attachment', async () => {
    const plan = await planManualOrder(exchange, keys, { ...base, takeProfit: 0 });
    expect(plan.takeProfit).toBe('0');
    expect(plan.stopLoss).toBe('59000.0');
    expect(plan.warnings.some((w) => w.includes('Tidak ada Take Profit'))).toBe(true);
  });

  it('requires a directional stop loss and rejects a Take Profit on the wrong side', async () => {
    await expect(planManualOrder(exchange, keys, { ...base, stopLoss: 61000 })).rejects.toThrow(/Stop Loss harus di bawah/);
    await expect(planManualOrder(exchange, keys, { ...base, takeProfit: 59000 })).rejects.toThrow(/Take Profit harus di atas/);
  });

  it('rejects size below the exchange minimum notional and leverage/SL liquidation risk', async () => {
    await expect(planManualOrder(exchange, keys, { ...base, quantity: 0.00001 })).rejects.toThrow(/di bawah minimum pair/);
    await expect(planManualOrder(exchange, keys, { ...base, leverage: 100, stopLoss: 55000 })).rejects.toThrow(/berisiko likuidasi/);
  });
});
