/** Pure maths for the analog rotary dial (270° sweep, opening at the bottom). */
export const DIAL_START_DEG = 135;   // sweep begins bottom-left (screen angles, 0° = +x, clockwise)
export const DIAL_SWEEP_DEG = 270;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** Ratio (0..1) for a touch point relative to the dial centre. Points inside the bottom gap snap to the nearer end. */
export function ratioFromPoint(dx: number, dy: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return 0;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;                 // -180..180
  const s = (((angle - DIAL_START_DEG) % 360) + 360) % 360;           // 0..360 along the sweep
  if (s <= DIAL_SWEEP_DEG) return s / DIAL_SWEEP_DEG;
  return s - DIAL_SWEEP_DEG < 360 - s ? 1 : 0;                         // gap: nearest end
}

/** Rejects a jump across the gap (e.g. 0.98 → 0.02) so the knob stops at the end instead of wrapping. */
export function guardWrap(prev: number, next: number): number {
  if (prev > 0.75 && next < 0.25) return 1;
  if (prev < 0.25 && next > 0.75) return 0;
  return next;
}

export function valueAtRatio(ratio: number, min: number, max: number, step = 1): number {
  const raw = min + clamp01(ratio) * (max - min);
  const snapped = step > 0 ? Math.round((raw - min) / step) * step + min : raw;
  return Math.max(min, Math.min(max, Number(snapped.toFixed(6))));
}

export function ratioOfValue(value: number, min: number, max: number): number {
  return max > min ? clamp01((value - min) / (max - min)) : 0;
}

/** Position of the knob centre for a ratio, relative to the dial centre. */
export function knobOffset(ratio: number, radius: number): { x: number; y: number } {
  const a = ((DIAL_START_DEG + clamp01(ratio) * DIAL_SWEEP_DEG) * Math.PI) / 180;
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
}
