export function clampSliderRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(1, ratio));
}

export function sliderValueAtRatio(ratio: number, min: number, max: number): number {
  const normalized = clampSliderRatio(ratio);
  return Math.round(min + normalized * (max - min));
}
