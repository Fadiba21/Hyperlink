export function money(value: string | number | undefined | null, digits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function price(value: number | string | undefined | null): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : n >= 0.01 ? 5 : 8;
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function signed(value: string | number | undefined | null, digits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: digits })}`;
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return 'baru saja';
  if (s < 60) return `${s} dtk lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export function decimalsOf(step: string | number): number {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const frac = s.split('.')[1];
  return frac ? frac.replace(/0+$/, '').length : 0;
}

export function floorToStep(value: number, step: string | number): string {
  const st = Number(step);
  if (!Number.isFinite(st) || st <= 0) return String(value);
  const floored = Math.floor(value / st + 1e-9) * st;
  return floored.toFixed(decimalsOf(step));
}

export function roundToStep(value: number, step: string | number): string {
  const st = Number(step);
  if (!Number.isFinite(st) || st <= 0) return String(value);
  return (Math.round(value / st) * st).toFixed(decimalsOf(step));
}

export function errorMessage(error: unknown, fallback = 'Terjadi kesalahan.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}
