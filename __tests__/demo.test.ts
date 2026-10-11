import { autoQty, closeDemo, initialDemo, openDemo, checkTriggers, DEMO_START } from '../src/demo';

test('auto quantity floors to step', () => {
  expect(autoQty(10000, 10, 60000)).toBe(0.166);
});

test('demo starts with paper balance', () => {
  expect(initialDemo().balance).toBe(DEMO_START);
});

test('exports demo helpers', () => {
  expect(typeof openDemo).toBe('function');
  expect(typeof closeDemo).toBe('function');
  expect(typeof checkTriggers).toBe('function');
});
