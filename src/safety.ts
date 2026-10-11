/** Pure risk guards for LIVE orders. Demo trading is never gated by these. */
export type SafetySettings = { safetyKill: boolean; readOnly: boolean; maxDailyLossPct: number; maxOpenPositions: number; confirmLeverage: number };
export type DayBaseline = { day: string; equity: number } | null;
export type Verdict = { ok: boolean; blocked: string[]; confirm: string[] };
export type LiveAutoSettings = { accountMode: 'live' | 'demo'; automationOn: boolean; liveAutoEntry: boolean };

/** Automatic exchange submissions are possible only when the user explicitly enables the separate Live switch. */
export const isLiveAutoEntryEnabled = (settings: LiveAutoSettings): boolean => settings.accountMode === 'live' && settings.automationOn && settings.liveAutoEntry;

export const dayKey = (now = Date.now()): string => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** First equity seen each local day becomes the day's baseline. */
export function rollBaseline(prev: DayBaseline, equity: number, now = Date.now()): DayBaseline {
  if (!Number.isFinite(equity) || equity <= 0) return prev;
  const day = dayKey(now);
  return prev && prev.day === day ? prev : { day, equity };
}
export const dailyLoss = (baseline: DayBaseline, equity: number): number => (baseline && Number.isFinite(equity) ? Math.max(0, baseline.equity - equity) : 0);

export function writeBlock(s: Pick<SafetySettings, 'readOnly'>): string | null {
  return s.readOnly ? 'Mode hanya-baca aktif. Matikan di Pengaturan › Pengaman untuk mengubah posisi.' : null;
}

export function checkLiveOrder(input: { settings: SafetySettings; plan: { leverage: number; maxLoss: number }; equity: number; positionCount: number; baseline: DayBaseline }): Verdict {
  const { settings, plan, equity, positionCount, baseline } = input;
  const blocked: string[] = []; const confirm: string[] = [];
  const ro = writeBlock(settings); if (ro) blocked.push(ro);
  if (settings.safetyKill) blocked.push('Kill-switch aktif: order Live baru diblokir. Matikan di Pengaturan › Pengaman.');
  if (settings.maxOpenPositions > 0 && positionCount >= settings.maxOpenPositions) blocked.push(`Sudah ${positionCount} posisi terbuka (batas ${settings.maxOpenPositions}).`);
  if (settings.maxDailyLossPct > 0 && baseline && baseline.equity > 0) {
    const limit = (baseline.equity * settings.maxDailyLossPct) / 100;
    const loss = dailyLoss(baseline, equity);
    if (loss >= limit) blocked.push(`Batas rugi harian ${settings.maxDailyLossPct}% tercapai (rugi $${loss.toFixed(2)} dari batas $${limit.toFixed(2)}).`);
    else if (loss + plan.maxLoss > limit) confirm.push(`Jika SL kena, rugi harian bisa melewati batas ${settings.maxDailyLossPct}% ($${(loss + plan.maxLoss).toFixed(2)} vs $${limit.toFixed(2)}).`);
  }
  if (settings.confirmLeverage > 0 && plan.leverage >= settings.confirmLeverage) confirm.push(`Leverage ${plan.leverage}x tergolong tinggi.`);
  return { ok: blocked.length === 0, blocked, confirm };
}
