export type PriceAlert = { id: string; symbol: string; price: number; dir: 'above' | 'below'; createdAt: number; triggeredAt?: number };

export const alertId = () => `al-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Direction is derived from where the target sits relative to the current price. */
export function makeAlert(symbol: string, target: number, current: number, now = Date.now()): PriceAlert {
  if (!(target > 0) || !Number.isFinite(target)) throw new Error('Harga alert tidak valid.');
  if (!(current > 0)) throw new Error('Harga saat ini belum tersedia.');
  if (Math.abs(target - current) / current < 0.0005) throw new Error('Harga alert terlalu dekat dengan harga sekarang.');
  return { id: alertId(), symbol, price: target, dir: target > current ? 'above' : 'below', createdAt: now };
}

/** Fires each alert once; returns the updated list and the alerts that just fired. */
export function evaluateAlerts(alerts: PriceAlert[], prices: Record<string, number>, now = Date.now()): { alerts: PriceAlert[]; fired: PriceAlert[] } {
  const fired: PriceAlert[] = [];
  const next = alerts.map((a) => {
    if (a.triggeredAt) return a;
    const p = prices[a.symbol];
    if (!(p > 0)) return a;
    const hit = a.dir === 'above' ? p >= a.price : p <= a.price;
    if (!hit) return a;
    const done = { ...a, triggeredAt: now };
    fired.push(done);
    return done;
  });
  return { alerts: fired.length ? next : alerts, fired };
}
export const activeAlerts = (alerts: PriceAlert[]) => alerts.filter((a) => !a.triggeredAt);
