import { approxLiq, levelFromRoi, qtyForAllocation, roiAt, roundDown, summarize } from '../src/orderMath';

test('roundDown respects step and float noise', () => {
  expect(roundDown(0.30000000000000004, 0.1)).toBe(0.3);
  expect(roundDown(1.2349, 0.001)).toBe(1.234);
  expect(roundDown(5, 0)).toBe(5);
  expect(roundDown(-1, 0.1)).toBe(0);
});
test('allocation sizing', () => {
  expect(qtyForAllocation(1000, 10, 10, 50000, 0.001)).toBe(0.02);
  expect(qtyForAllocation(0, 10, 10, 50000)).toBe(0);
  expect(qtyForAllocation(1000, 500, 1, 100, 0.01)).toBe(10);   // pct clamps to 100
});
test('TP/SL by ROI is symmetric for long and short', () => {
  expect(levelFromRoi(100, 'Buy', 10, 50, 'tp')).toBeCloseTo(105, 6);
  expect(levelFromRoi(100, 'Buy', 10, 50, 'sl')).toBeCloseTo(95, 6);
  expect(levelFromRoi(100, 'Sell', 10, 50, 'tp')).toBeCloseTo(95, 6);
  expect(levelFromRoi(100, 'Sell', 10, 50, 'sl')).toBeCloseTo(105, 6);
  expect(levelFromRoi(0, 'Buy', 10, 50, 'tp')).toBe(0);
  expect(roiAt(100, 'Buy', 10, 105)).toBeCloseTo(50, 6);
  expect(roiAt(100, 'Sell', 10, 105)).toBeCloseTo(-50, 6);
});
test('liquidation and summary', () => {
  expect(approxLiq(100, 'Buy', 10)).toBeCloseTo(100 * (1 - 0.095), 6);
  expect(approxLiq(100, 'Sell', 10)).toBeCloseTo(100 * 1.095, 6);
  const s = summarize({ entry: 100, qty: 2, leverage: 10, side: 'Buy', sl: 95, tp: 110 });
  expect(s.notional).toBe(200); expect(s.margin).toBe(20); expect(s.maxLoss).toBe(10); expect(s.maxProfit).toBe(20); expect(s.rr).toBe(2);
  expect(summarize({ entry: 100, qty: 0, leverage: 10, side: 'Sell' }).notional).toBe(0);
});
