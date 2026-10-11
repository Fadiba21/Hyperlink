import { diffPositions, levelOf, liqRatio, nextRiskAlerts, riskMessage } from '../src/riskAlerts';

test('liquidation ratio for long and short', () => {
  expect(liqRatio('LONG', 100, 90, 95)).toBeCloseTo(0.5, 6);
  expect(liqRatio('SHORT', 100, 110, 107.5)).toBeCloseTo(0.75, 6);
  expect(liqRatio('LONG', 100, 90, 105)).toBe(0);       // in profit
  expect(liqRatio('LONG', 100, 0, 95)).toBe(0);         // unknown liq price
});
test('levels at 75% and 90%', () => {
  expect(levelOf(0.74)).toBe(0);
  expect(levelOf(0.75)).toBe(1);
  expect(levelOf(0.9)).toBe(2);
});
test('alerts once per escalation, re-arm only after recovery', () => {
  const item = (mark: number) => [{ key: 'a', symbol: 'BTC', side: 'LONG' as const, entry: 100, liq: 90, mark }];
  let r = nextRiskAlerts({}, item(95));
  expect(r.alerts).toHaveLength(0);
  r = nextRiskAlerts(r.state, item(92.4));   // 76%
  expect(r.alerts).toHaveLength(1);
  expect(r.alerts[0].level).toBe(1);
  r = nextRiskAlerts(r.state, item(92.3));   // same level: silent
  expect(r.alerts).toHaveLength(0);
  r = nextRiskAlerts(r.state, item(90.8));   // 92% -> critical
  expect(r.alerts).toHaveLength(1);
  expect(r.alerts[0].level).toBe(2);
  r = nextRiskAlerts(r.state, item(91.5));   // 85%: still inside re-arm gap, silent
  expect(r.alerts).toHaveLength(0);
  r = nextRiskAlerts(r.state, item(98));     // recovered
  expect(r.alerts).toHaveLength(0);
  r = nextRiskAlerts(r.state, item(92.4));   // warns again
  expect(r.alerts).toHaveLength(1);
});
test('message text', () => {
  const m = riskMessage({ key: 'a', symbol: 'BTC', side: 'LONG', level: 2, ratio: 0.93, liq: 90, mark: 90.7 }, (n) => String(n));
  expect(m).toContain('Hampir margin call');
  expect(m).toContain('93%');
});
test('live position diff: open, TP, SL, plain close', () => {
  const p = (key: string, mark: number, extra = {}) => ({ key, symbol: key, side: 'LONG' as const, entry: 100, mark, ...extra });
  const ev = diffPositions([p('A', 110, { tp: 110 }), p('B', 90, { sl: 90 }), p('C', 100)], [p('D', 100)]);
  expect(ev.map((e) => e.kind)).toEqual(['opened', 'tp', 'sl', 'closed']);
});
