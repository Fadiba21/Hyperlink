import { checkLiveOrder, dailyLoss, dayKey, rollBaseline, writeBlock, type SafetySettings } from '../src/safety';
import { evaluateAlerts, makeAlert } from '../src/alerts';
import { hashPin, lockoutSeconds, shouldRelock, isValidPin, LOCK_AFTER_MS } from '../src/lock';
import { backoffMs } from '../src/http';
import { feedSpec } from '../src/liveFeed';
import { ema, rsi, sma, windowRange } from '../src/pairs';
import { initialDemo, parseDemo, serializeDemo } from '../src/demo';

const S: SafetySettings = { safetyKill: false, readOnly: false, maxDailyLossPct: 5, maxOpenPositions: 3, confirmLeverage: 20 };
const plan = { leverage: 10, maxLoss: 10 };

describe('safety gate', () => {
  it('passes a normal order', () => expect(checkLiveOrder({ settings: S, plan, equity: 1000, positionCount: 0, baseline: null }).ok).toBe(true));
  it('blocks on kill-switch and read-only', () => {
    expect(checkLiveOrder({ settings: { ...S, safetyKill: true }, plan, equity: 1000, positionCount: 0, baseline: null }).ok).toBe(false);
    expect(writeBlock({ readOnly: true })).toBeTruthy();
  });
  it('blocks at max positions', () => expect(checkLiveOrder({ settings: S, plan, equity: 1000, positionCount: 3, baseline: null }).ok).toBe(false));
  it('blocks when daily loss limit is hit, asks confirm when SL would cross it', () => {
    const base = { day: dayKey(), equity: 1000 };
    expect(checkLiveOrder({ settings: S, plan, equity: 940, positionCount: 0, baseline: base }).ok).toBe(false);
    const near = checkLiveOrder({ settings: S, plan, equity: 955, positionCount: 0, baseline: base });
    expect(near.ok).toBe(true); expect(near.confirm.length).toBeGreaterThan(0);
  });
  it('baseline rolls once per day and ignores bad equity', () => {
    const now = new Date(2026, 0, 5, 10).getTime();
    const a = rollBaseline(null, 500, now);
    expect(rollBaseline(a, 400, now + 3600000)).toBe(a);
    expect(rollBaseline(a, 400, now + 86400000)?.equity).toBe(400);
    expect(rollBaseline(a, NaN, now)).toBe(a);
    expect(dailyLoss(a, 450)).toBe(50); expect(dailyLoss(a, 600)).toBe(0);
  });
});

describe('alerts', () => {
  it('derives direction and rejects nonsense', () => {
    expect(makeAlert('BTCUSDT', 110, 100).dir).toBe('above');
    expect(makeAlert('BTCUSDT', 90, 100).dir).toBe('below');
    expect(() => makeAlert('BTCUSDT', 100.01, 100)).toThrow();
    expect(() => makeAlert('BTCUSDT', -1, 100)).toThrow();
  });
  it('fires once', () => {
    const a = makeAlert('BTCUSDT', 110, 100);
    const r = evaluateAlerts([a], { BTCUSDT: 111 }, 5);
    expect(r.fired).toHaveLength(1);
    expect(evaluateAlerts(r.alerts, { BTCUSDT: 120 }, 6).fired).toHaveLength(0);
    expect(evaluateAlerts([a], { BTCUSDT: 105 }).fired).toHaveLength(0);
  });
});

describe('lock', () => {
  it('hash is salted and deterministic', () => {
    expect(hashPin('123456', 'a', 10)).toBe(hashPin('123456', 'a', 10));
    expect(hashPin('123456', 'a', 10)).not.toBe(hashPin('123456', 'b', 10));
  });
  it('validates pins, lockout and relock', () => {
    expect(isValidPin('123456')).toBe(true); expect(isValidPin('12345')).toBe(false); expect(isValidPin('12345a')).toBe(false);
    expect(lockoutSeconds(2)).toBe(0); expect(lockoutSeconds(3)).toBe(15); expect(lockoutSeconds(20)).toBe(300);
    expect(shouldRelock(1000, 1000 + LOCK_AFTER_MS, true)).toBe(true);
    expect(shouldRelock(1000, 1000 + LOCK_AFTER_MS - 1, true)).toBe(false);
    expect(shouldRelock(1000, 999999, false)).toBe(false); expect(shouldRelock(null, 999999, true)).toBe(false);
  });
});

describe('http backoff and feeds', () => {
  it('grows and honours Retry-After', () => {
    expect(backoffMs(0)).toBe(400); expect(backoffMs(1)).toBeGreaterThan(backoffMs(0)); expect(backoffMs(9)).toBe(3000); expect(backoffMs(0, '2')).toBe(2000);
  });
  it('feed specs are mainnet-only and parse ticks', () => {
    expect(feedSpec('bitget', 'testnet', 'BTCUSDT')).toBeNull();
    expect(feedSpec('bybit', 'testnet', 'BTCUSDT')!.url).toContain('testnet');
    expect(feedSpec('bitget', 'mainnet', 'BTCUSDT')!.parse({ arg: { instId: 'BTCUSDT' }, data: [{ lastPr: '64000' }] })).toBe(64000);
    expect(feedSpec('bitget', 'mainnet', 'BTCUSDT')!.parse({ arg: { instId: 'ETHUSDT' }, data: [{ lastPr: '1' }] })).toBeNull();
    expect(feedSpec('bybit', 'mainnet', 'BTCUSDT')!.parse({ topic: 'tickers.BTCUSDT', data: { lastPrice: '65000.5' } })).toBe(65000.5);
    expect(feedSpec('binance', 'mainnet', 'ETHUSDT')!.parse({ e: '24hrMiniTicker', c: '3000' })).toBe(3000);
    expect(feedSpec('okx', 'mainnet', 'SOLUSDT')!.parse({ data: [{ last: '150' }] })).toBe(150);
    expect(feedSpec('okx', 'mainnet', 'SOLUSDT')!.parse({ event: 'subscribe' })).toBeNull();
  });
});

describe('indicators', () => {
  it('sma/ema warm-up and values', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(ema([1, 2, 3, 4, 5], 3).slice(0, 2)).toEqual([null, null]);
    expect(ema([1, 2, 3], 3)[2]).toBe(2);
  });
  it('rsi is bounded and extreme on monotone series', () => {
    const up = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(rsi(up)[29]).toBe(100);
    expect(rsi(up.slice().reverse())[29]).toBe(0);
    expect(rsi([1, 2, 3], 14)).toEqual([null, null, null]);
    rsi(Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 5)).forEach((v) => { if (v !== null) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); } });
  });
  it('windowRange clamps zoom and pan', () => {
    expect(windowRange(100, 60, 0)).toEqual({ from: 40, to: 100 });
    expect(windowRange(100, 60, 30)).toEqual({ from: 10, to: 70 });
    expect(windowRange(100, 60, 999)).toEqual({ from: 0, to: 60 });
    expect(windowRange(5, 60, 0)).toEqual({ from: 0, to: 5 });
  });
});

describe('demo export/import', () => {
  it('round-trips and rejects garbage', () => {
    const d = initialDemo();
    expect(parseDemo(serializeDemo(d))).toEqual(d);
    expect(() => parseDemo('not json')).toThrow();
    expect(() => parseDemo('{"balance":"x"}')).toThrow();
  });
});
