import { guardWrap, knobOffset, ratioFromPoint, ratioOfValue, valueAtRatio } from '../src/dial';

test('dial maps angle to ratio across the 270° sweep', () => {
  expect(ratioFromPoint(-1, 1)).toBeCloseTo(0, 5);        // bottom-left = start
  expect(ratioFromPoint(0, -1)).toBeCloseTo(0.5, 5);      // top = middle
  expect(ratioFromPoint(1, 1)).toBeCloseTo(1, 5);         // bottom-right = end
  expect(ratioFromPoint(-1, 0)).toBeCloseTo(1 / 6, 5);    // left
  expect(ratioFromPoint(1, 0)).toBeCloseTo(5 / 6, 5);     // right
});
test('dial gap snaps to nearest end and ignores the exact centre', () => {
  expect(ratioFromPoint(-0.2, 1)).toBe(0);
  expect(ratioFromPoint(0.2, 1)).toBe(1);
  expect(ratioFromPoint(0, 0)).toBe(0);
  expect(ratioFromPoint(Number.NaN, 1)).toBe(0);
});
test('guardWrap stops the knob at the ends', () => {
  expect(guardWrap(0.97, 0.03)).toBe(1);
  expect(guardWrap(0.03, 0.97)).toBe(0);
  expect(guardWrap(0.4, 0.5)).toBe(0.5);
});
test('values are stepped, clamped and round-trip', () => {
  expect(valueAtRatio(0, 1, 100)).toBe(1);
  expect(valueAtRatio(1, 1, 100)).toBe(100);
  expect(valueAtRatio(0.5, 1, 100)).toBe(51);
  expect(valueAtRatio(0.33, 0, 100, 5)).toBe(35);
  expect(valueAtRatio(5, 1, 20)).toBe(20);
  expect(ratioOfValue(51, 1, 100)).toBeCloseTo(0.505, 3);
  expect(ratioOfValue(5, 5, 5)).toBe(0);
});
test('knob offset starts bottom-left and ends bottom-right', () => {
  const a = knobOffset(0, 10); const b = knobOffset(1, 10); const m = knobOffset(0.5, 10);
  expect(a.x).toBeCloseTo(-7.07, 1); expect(a.y).toBeCloseTo(7.07, 1);
  expect(b.x).toBeCloseTo(7.07, 1); expect(b.y).toBeCloseTo(7.07, 1);
  expect(m.y).toBeCloseTo(-10, 5);
});
