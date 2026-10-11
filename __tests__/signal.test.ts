import { entryRange, looksLikeCall, normalizeSymbol, parseTelegramCall, riskReward, takeProfitLevels, validateSignal, type Signal } from '../src/signal';
import { decimalsOf, floorToStep, roundToStep } from '../src/format';

const long: Signal = { symbol: 'BTCUSDT', direction: 'LONG', entry: 60000, stopLoss: 59000, takeProfit: 62000, leverage: 10, confidence: 0.9, rationale: '' };

test('validates consistent signals and rejects inconsistent ones', () => {
  expect(validateSignal(long)).toBeNull();
  expect(validateSignal({ ...long, stopLoss: 61000 })).not.toBeNull();
  expect(validateSignal({ ...long, direction: 'SHORT' })).not.toBeNull();
  expect(validateSignal({ ...long, leverage: 100 })).not.toBeNull();
  expect(validateSignal({ ...long, symbol: 'BTC' })).not.toBeNull();
});

test('normalizes symbols and computes risk reward', () => {
  expect(normalizeSymbol('btc/usdt')).toBe('BTCUSDT');
  expect(normalizeSymbol('ETH')).toBe('ETHUSDT');
  expect(riskReward(long)).toBe(2);
});

test('call pre-filter', () => {
  expect(looksLikeCall('good morning everyone, have a nice day')).toBe(false);
  expect(looksLikeCall('BTCUSDT long entry 60000 sl 59000 tp 62000')).toBe(true);
});

test('step rounding', () => {
  expect(decimalsOf('0.001')).toBe(3);
  expect(floorToStep(1.23456, '0.01')).toBe('1.23');
  expect(roundToStep(60000.07, '0.1')).toBe('60000.1');
});

test('parses Telegram entry zone and all targets from the supplied call layout', () => {
  const call = `⚡ #IOTX/USDT\n\n📤 Long\n\n💹 Buy: 0.003740 - 0.003600\n\n🧿 Target: 0.003777 - 0.003814 - 0.003852 - 0.003890 - 0.003930 - 0.003969\n\n🧨 StopLoss: 0.003560\n\n🔘 Leverage: 20x.`;
  const parsed = parseTelegramCall(call);
  expect(parsed).toMatchObject({ symbol: 'IOTXUSDT', direction: 'LONG', entryLow: 0.0036, entryHigh: 0.00374, stopLoss: 0.00356, leverage: 20 });
  expect(parsed?.takeProfits).toEqual([0.003777, 0.003814, 0.003852, 0.00389, 0.00393, 0.003969]);
  expect(parsed && validateSignal(parsed)).toBeNull();
  expect(parsed && entryRange(parsed)).toEqual({ low: 0.0036, high: 0.00374 });
  expect(parsed && takeProfitLevels(parsed)).toHaveLength(6);
});
