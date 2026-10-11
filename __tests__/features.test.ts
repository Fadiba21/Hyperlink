import { demoStats, decideEntry, liquidationPrice, processOrders, queueDemoOrder, initialDemo, qtyForMargin, ORDER_TTL_MS, closeDemoFraction, updateDemoTpSl, validateDemoLevels, openDemo, checkTriggers } from '../src/demo';
import { boundAdvice, effectiveMargin, localAdvice } from '../src/advice';
import { simulateCall } from '../src/simulate';
import { closeQty, toTpSl, validateTpSl } from '../src/manage';
import { clearCoinGeckoCache, coinGeckoLivePrices, coinGeckoPriceHistory, compactUsd, mapCoinGeckoCandles } from '../src/coingecko';
import type { Signal } from '../src/signal';
import { SPLASH_MIN_MS, splashFadeDelay } from '../src/Intro';

const L: Signal = { symbol: 'BTCUSDT', direction: 'LONG', entry: 60000, stopLoss: 59000, takeProfit: 62000, leverage: 10, confidence: 0.9, rationale: '' };
const sizing = () => ({ step: 0.001, minQty: 0.001 });

test('intro splash waits three seconds before fading once startup is ready', () => {
  expect(SPLASH_MIN_MS).toBe(3000);
  expect(splashFadeDelay(800)).toBe(2200);
  expect(splashFadeDelay(3500)).toBe(0);
});

test('margin advice is bounded and effective margin follows precedence', () => {
  const base = localAdvice(L, { riskPerTradePct: 2, marginMode: 'Isolated' });
  expect(base.pct).toBe(12);
  expect(boundAdvice({ pct: 90, mode: 'Cross', risk: 'rendah', reason: 'x' }, base, L).pct).toBe(18);
  const settings = { marginPct: 7, marginMode: 'Cross' as const, marginSource: 'ai' as const };
  expect(effectiveMargin(settings, { advice: base }).pct).toBe(12);
  expect(effectiveMargin(settings, { advice: base, marginPct: 40 }).from).toBe('manual');
  expect(effectiveMargin({ ...settings, marginSource: 'fixed' }, { advice: base }).pct).toBe(7);
  expect(effectiveMargin(settings, { marginPct: 500 }).pct).toBe(100);
});

test('demo: sizing, entry decision and pending call orders', () => {
  expect(qtyForMargin(10000, 10, 10, 60000, 0.001)).toBe(0.166);
  expect(decideEntry('LONG', 60000, 60050, 59000, 62000).kind).toBe('market');
  expect(decideEntry('LONG', 60000, 60500, 59000, 62000, 0.002, 59500, 60200)).toMatchObject({ kind: 'pending', waitFor: 'down', targetPrice: 60200 });
  expect(decideEntry('LONG', 60000, 58000, 59000, 62000).kind).toBe('stale');
  const d = queueDemoOrder(initialDemo(), { symbol: 'BTCUSDT', side: 'LONG', entry: 59500, leverage: 10, marginPct: 10, marginMode: 'Isolated', takeProfit: 62000, stopLoss: 58500, waitFor: 'down' }, 1000);
  expect(processOrders(d, { BTCUSDT: 60500 }, sizing, 2000).events).toHaveLength(0);
  const filled = processOrders(d, { BTCUSDT: 59400 }, sizing, 2000);
  expect(filled.events[0].kind).toBe('filled');
  expect(filled.state.positions[0].entry).toBe(59500);
  expect(processOrders(d, { BTCUSDT: 62100 }, sizing, 2000).events[0].kind).toBe('cancelled');
  expect(processOrders(d, { BTCUSDT: 60500 }, sizing, 1000 + ORDER_TTL_MS + 1).events[0].kind).toBe('expired');
  expect(liquidationPrice({ side: 'LONG', entry: 60000, leverage: 10, size: 0.1, margin: 600, marginMode: 'Cross' }, 9000)).toBeLessThan(liquidationPrice({ side: 'LONG', entry: 60000, leverage: 10 }));
  expect(demoStats([{ id: '1', symbol: 'A', side: 'LONG', pnl: 100, reason: 'TP', closedAt: 1 }, { id: '2', symbol: 'A', side: 'LONG', pnl: -50, reason: 'SL', closedAt: 2 }]).profitFactor).toBe(2);
});

test('demo: fixed-quantity limit order, editable TP/SL, and partial close are local', () => {
  const pending = queueDemoOrder(initialDemo(), { symbol: 'BTCUSDT', side: 'LONG', entry: 59000, qty: 0.1, leverage: 10, marginPct: 0, marginMode: 'Isolated', orderType: 'limit', takeProfit: 62000, stopLoss: 58000, waitFor: 'down' }, 1000);
  const filled = processOrders(pending, { BTCUSDT: 59000 }, () => ({ step: 0.001, minQty: 0 }), 2000);
  expect(filled.events[0].kind).toBe('filled');
  expect(filled.state.positions[0]).toMatchObject({ entry: 59000, size: 0.1, takeProfit: 62000, stopLoss: 58000 });
  const changed = updateDemoTpSl(filled.state, filled.state.positions[0].id, { takeProfit: 63000, stopLoss: 57000 });
  expect(changed.positions[0]).toMatchObject({ takeProfit: 63000, stopLoss: 57000 });
  expect(() => validateDemoLevels('LONG', 59000, { stopLoss: 60000 })).toThrow(/di bawah/);
  const partial = closeDemoFraction(changed, changed.positions[0].id, 60000, 0.5, 'Manual', 3000);
  expect(partial.state.positions[0].size).toBeCloseTo(0.05);
  expect(partial.state.closed[0].pnl).toBeCloseTo(50);
});

test('demo live quote uses the keyless CoinGecko public endpoint and records history', async () => {
  const previousFetch = globalThis.fetch;
  clearCoinGeckoCache();
  const base = `XOT${Date.now().toString(36).slice(-8)}`.toUpperCase();
  const search = { coins: [{ id: 'test-coin', name: 'Test Coin', symbol: base, market_cap_rank: 1000 }] };
  const quote = { 'test-coin': { usd: 12.5, usd_24h_change: 2.5, last_updated_at: Math.floor(Date.now() / 1000) } };
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(search) })
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(quote) });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  try {
    const result = await coinGeckoLivePrices([`${base}USDT`], true);
    expect(result[0]).toMatchObject({ symbol: `${base}USDT`, baseSymbol: base, last: 12.5, change24h: 0.025 });
    expect(coinGeckoPriceHistory(`${base}USDT`, '24h')).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/search?query=');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/simple/price?ids=test-coin');
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).not.toHaveProperty('x-cg-demo-api-key');
  } finally {
    globalThis.fetch = previousFetch;
    clearCoinGeckoCache();
  }
});

test('CoinGecko OHLC parser accepts timestamp/open/high/low/close tuples', () => {
  const time = Date.parse('2026-10-08T10:00:00.000Z');
  expect(mapCoinGeckoCandles([[time, 100, 110, 90, 105]])).toEqual([{ t: time, o: 100, h: 110, l: 90, c: 105 }]);
  expect(mapCoinGeckoCandles({ invalid: true })).toHaveLength(0);
});

test('simulating a call against candles', () => {
  const c = (t: number, h: number, l: number) => ({ t, o: 60000, h, l, c: 60000 });
  expect(simulateCall(L, [c(2, 60100, 59900), c(3, 62100, 59950)], 1, { marginPct: 10, marginMode: 'Isolated' }).outcome).toBe('TP');
  expect(simulateCall(L, [c(2, 62500, 58500)], 1, { marginPct: 10, marginMode: 'Isolated' }).outcome).toBe('SL');
  expect(simulateCall({ ...L, entry: 59400, stopLoss: 58000 }, [c(2, 62500, 60800)], 1, { marginPct: 10, marginMode: 'Isolated' }).outcome).toBe('noentry');
});

test('position management helpers', () => {
  expect(validateTpSl('LONG', 60000, {}, { stopLoss: 59000, takeProfit: 61000 })).toBeNull();
  expect(validateTpSl('LONG', 60000, {}, { stopLoss: 61000 })).toMatch(/di bawah/);
  expect(toTpSl({ stopLoss: '59000,55', takeProfit: '0' }, '0.1')).toEqual({ stopLoss: '59000.6', takeProfit: '0' });
  expect(closeQty('0.5', 100, '0.001')).toBeUndefined();
  expect(closeQty('0.5', 50, '0.001')).toBe('0.250');
  expect(compactUsd(2.3e12)).toBe('$2.30T');
});

test('demo target ladder takes staged profit and closes remaining size on last target', () => {
  const opened = openDemo(initialDemo(), { symbol: 'BTCUSDT', side: 'LONG', qty: 1, price: 100, leverage: 2, stopLoss: 90, takeProfit: 110, takeProfits: [110, 120, 130] }, 1000);
  const first = checkTriggers(opened, { BTCUSDT: 111 }, 2000);
  expect(first.events).toHaveLength(1);
  expect(first.events[0].reason).toBe('Take Profit 1 (33%)');
  expect(first.state.positions[0].size).toBeCloseTo(2 / 3);
  expect(first.state.positions[0].hitTakeProfits).toEqual([0]);
  const jumped = checkTriggers(first.state, { BTCUSDT: 135 }, 3000);
  expect(jumped.events.map((e) => e.reason)).toEqual(['Take Profit 2 (50%)', 'Take Profit 3']);
  expect(jumped.state.positions).toHaveLength(0);
});
