/** Exchange-style position warnings: how close a position is to liquidation (margin call). Pure and testable. */

export type RiskSide = 'LONG' | 'SHORT';
export type RiskLevel = 0 | 1 | 2;
export const RISK_WARN = 0.75;
export const RISK_CRITICAL = 0.9;
/** Hysteresis: a level only re-arms after the ratio falls this far below its threshold (stops flapping alerts). */
const REARM_GAP = 0.08;

/** 0 = at entry, 1 = at liquidation price. Negative values (in profit) clamp to 0. */
export function liqRatio(side: RiskSide, entry: number, liq: number, mark: number): number {
  if (!(entry > 0) || !(liq > 0) || !(mark > 0)) return 0;
  const span = side === 'LONG' ? entry - liq : liq - entry;
  if (!(span > 0)) return 0;
  const moved = side === 'LONG' ? entry - mark : mark - entry;
  return Math.max(0, Math.min(1.5, moved / span));
}

export function levelOf(ratio: number): RiskLevel { return ratio >= RISK_CRITICAL ? 2 : ratio >= RISK_WARN ? 1 : 0; }

export type RiskInput = { key: string; symbol: string; side: RiskSide; entry: number; liq: number; mark: number };
export type RiskAlert = { key: string; symbol: string; side: RiskSide; level: 1 | 2; ratio: number; liq: number; mark: number };

/**
 * Compares each position with the level already announced. Escalations (0→1, 0→2, 1→2) alert once; the level
 * drops back only after the ratio recovers past the re-arm gap. Positions that vanished are forgotten.
 */
export function nextRiskAlerts(announced: Record<string, RiskLevel>, items: RiskInput[]): { state: Record<string, RiskLevel>; alerts: RiskAlert[] } {
  const state: Record<string, RiskLevel> = {};
  const alerts: RiskAlert[] = [];
  for (const it of items) {
    const ratio = liqRatio(it.side, it.entry, it.liq, it.mark);
    const raw = levelOf(ratio);
    let prev = announced[it.key] ?? 0;
    if (prev === 2 && ratio < RISK_CRITICAL - REARM_GAP) prev = raw >= 1 ? 1 : 0;
    if (prev === 1 && ratio < RISK_WARN - REARM_GAP) prev = 0;
    if (raw > prev) { alerts.push({ key: it.key, symbol: it.symbol, side: it.side, level: raw as 1 | 2, ratio, liq: it.liq, mark: it.mark }); prev = raw; }
    state[it.key] = prev;
  }
  return { state, alerts };
}

export function riskMessage(a: RiskAlert, fmt: (n: number) => string): string {
  const pct = Math.round(Math.min(a.ratio, 1) * 100);
  return a.level === 2
    ? `Hampir margin call · ${a.symbol} ${a.side} ${pct}% menuju likuidasi ($${fmt(a.liq)})`
    : `Risiko likuidasi · ${a.symbol} ${a.side} sudah ${pct}% menuju likuidasi ($${fmt(a.liq)})`;
}

/* ---------- live position open / close detection ---------- */
export type SeenPosition = { key: string; symbol: string; side: RiskSide; entry: number; mark: number; sl?: number; tp?: number };
export type PositionEvent = { kind: 'opened' | 'tp' | 'sl' | 'closed'; position: SeenPosition };

/** Compares two exchange syncs. A vanished position counts as TP/SL when its last mark was at/through the level (0.3% slack). */
export function diffPositions(prev: SeenPosition[], next: SeenPosition[]): PositionEvent[] {
  const events: PositionEvent[] = [];
  const nextKeys = new Set(next.map((p) => p.key));
  const prevKeys = new Set(prev.map((p) => p.key));
  for (const p of next) if (!prevKeys.has(p.key)) events.push({ kind: 'opened', position: p });
  for (const p of prev) {
    if (nextKeys.has(p.key)) continue;
    const long = p.side === 'LONG';
    const slack = 0.003;
    const hitSl = !!p.sl && p.mark > 0 && (long ? p.mark <= p.sl * (1 + slack) : p.mark >= p.sl * (1 - slack));
    const hitTp = !!p.tp && p.mark > 0 && (long ? p.mark >= p.tp * (1 - slack) : p.mark <= p.tp * (1 + slack));
    events.push({ kind: hitTp ? 'tp' : hitSl ? 'sl' : 'closed', position: p });
  }
  return events;
}
