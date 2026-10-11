import { clampSliderRatio, sliderValueAtRatio } from '../src/slider';

test('slider keeps repeated drag values clamped and integer-stable', () => {
  const values = Array.from({ length: 501 }, (_, index) => sliderValueAtRatio(index / 500, 1, 50));
  expect(values[0]).toBe(1);
  expect(values[values.length - 1]).toBe(50);
  expect(values.every((value) => Number.isInteger(value) && value >= 1 && value <= 50)).toBe(true);
  expect(values).toEqual([...values].sort((a, b) => a - b));
  const backAndForth = [0, 0.25, 0.5, 0.75, 1, 0.8, 0.3, 0.9, 0.1, 0].map((ratio) => sliderValueAtRatio(ratio, 1, 50));
  expect(backAndForth).toEqual([1, 13, 26, 38, 50, 40, 16, 45, 6, 1]);
});

test('slider clamps overshoot and safely handles invalid ratios', () => {
  expect(clampSliderRatio(-0.2)).toBe(0);
  expect(clampSliderRatio(1.2)).toBe(1);
  expect(clampSliderRatio(Number.NaN)).toBe(0);
  expect(sliderValueAtRatio(-2, 0, 100)).toBe(0);
  expect(sliderValueAtRatio(2, 0, 100)).toBe(100);
  expect(sliderValueAtRatio(0.555, 0, 100)).toBe(56);
});
