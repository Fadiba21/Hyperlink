import { bollinger, macd, niceTicks, panOffset, pinchCount, timeLabel, vwap, windowStats } from '../src/chartMath';

test('niceTicks give round, in-range values', () => {
  expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  const t = niceTicks(63210, 64870, 5);
  expect(t.every((v) => v >= 63210 && v <= 64870)).toBe(true);
  expect(t.length).toBeGreaterThanOrEqual(3);
  expect(niceTicks(5, 5)).toEqual([5]);
  expect(niceTicks(Number.NaN, 5)).toEqual([]);
});
test('bollinger bands are symmetric and null during warm-up', () => {
  const v = Array.from({ length: 30 }, (_, i) => 100 + (i % 5));
  const b = bollinger(v, 20, 2);
  expect(b[18]).toBeNull();
  const x = b[29]!; expect(x.up - x.mid).toBeCloseTo(x.mid - x.lo, 8);
  expect(bollinger([5, 5, 5, 5], 3)[3]).toEqual({ mid: 5, up: 5, lo: 5 });
});
test('macd warms up and flat series is zero', () => {
  const flat = Array.from({ length: 60 }, () => 10);
  const m = macd(flat);
  expect(m[24]).toBeNull(); expect(m[25]).not.toBeNull();
  expect(m[59]!.macd).toBeCloseTo(0, 8); expect(m[59]!.hist).toBeCloseTo(0, 8);
  const up = macd(Array.from({ length: 80 }, (_, i) => 100 + i));
  expect(up[79]!.macd).toBeGreaterThan(0);
  expect(macd([])).toEqual([]);
});
test('vwap weights by volume', () => {
  const c = [{ t: 1, o: 1, h: 10, l: 10, c: 10, v: 1 }, { t: 2, o: 1, h: 20, l: 20, c: 20, v: 3 }];
  const r = vwap(c);
  expect(r[0]).toBeCloseTo(10, 8); expect(r[1]).toBeCloseTo(17.5, 8);
  expect(vwap([{ t: 1, o: 1, h: 2, l: 1, c: 2 }])).toEqual([null]);
});
test('pan and pinch clamp', () => {
  expect(panOffset(0, 50, 5, 100, 60)).toBe(10);
  expect(panOffset(0, -50, 5, 100, 60)).toBe(0);
  expect(panOffset(30, 500, 5, 100, 60)).toBe(40);
  expect(panOffset(3, 10, 0, 100, 60)).toBe(3);
  expect(pinchCount(60, 2, 200)).toBe(30);
  expect(pinchCount(60, 0.5, 200)).toBe(120);
  expect(pinchCount(60, 100, 200)).toBe(12);
  expect(pinchCount(60, 0.01, 90)).toBe(90);
  expect(pinchCount(60, 0, 200)).toBe(60);
});
test('time labels and window stats', () => {
  const t = new Date(2026, 9, 11, 8, 5).getTime();
  expect(timeLabel(t, 3600000)).toBe('08:05');
  expect(timeLabel(t, 10 * 86400000)).toBe('11 Okt');
  expect(timeLabel(t, 300 * 86400000)).toBe('Okt 26');
  const s = windowStats([{ t: 1, o: 100, h: 110, l: 95, c: 105, v: 2 }, { t: 2, o: 105, h: 120, l: 100, c: 110, v: 3 }])!;
  expect(s.high).toBe(120); expect(s.low).toBe(95); expect(s.changePct).toBeCloseTo(10, 8); expect(s.volume).toBe(5);
  expect(windowStats([])).toBeNull();
});
