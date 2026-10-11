import type { MarginMode } from './exchanges/types';
import { riskReward, type Signal } from './signal';

export type MarginAdvice = { pct: number; mode: MarginMode; risk: 'rendah' | 'sedang' | 'tinggi'; reason: string; source: 'ai' | 'local' };
export type MarginSettings = { marginPct: number; marginMode: MarginMode; marginSource: 'fixed' | 'ai' };
export type MarginOverride = { marginPct?: number; marginMode?: MarginMode; advice?: MarginAdvice };
export type AdviceContext = { riskPerTradePct: number; marginMode: MarginMode; equity?: number };

const clampPct = (n: number) => Math.max(1, Math.min(100, Math.round(n)));

/** Deterministic baseline: margin so that a stop-loss hit loses ~riskPerTradePct of equity. */
export function localAdvice(s: Signal, ctx: AdviceContext): MarginAdvice {
  const slDist = Math.abs(s.entry - s.stopLoss) / s.entry;
  const lossOnMargin = slDist * s.leverage; // fraction of margin lost at SL
  const rr = riskReward(s);
  let pct = lossOnMargin > 0 ? ctx.riskPerTradePct / lossOnMargin : 5;
  pct *= s.confidence >= 0.9 ? 1 : s.confidence >= 0.8 ? 0.85 : 0.7;
  pct *= rr >= 2 ? 1 : rr >= 1.5 ? 0.9 : rr >= 1 ? 0.75 : 0.5;
  pct *= s.leverage > 50 ? 0.5 : s.leverage > 20 ? 0.7 : 1;
  const notes: string[] = [`SL ${(slDist * 100).toFixed(1)}% × ${s.leverage}x = rugi ${(lossOnMargin * 100).toFixed(0)}% dari margin`];
  const nearLiq = slDist >= 0.8 / s.leverage;
  if (nearLiq) { pct = Math.min(pct, 3); notes.push('SL sangat dekat titik likuidasi'); }
  const mode: MarginMode = s.leverage > 20 || nearLiq ? 'Isolated' : ctx.marginMode;
  if (mode === 'Cross') pct *= 0.7;
  if (rr < 1.5) notes.push(`R:R rendah (${rr.toFixed(1)})`);
  const out = clampPct(pct);
  const risk: MarginAdvice['risk'] = nearLiq || lossOnMargin > 0.5 || s.leverage > 30 ? 'tinggi' : lossOnMargin > 0.25 || s.leverage > 15 || rr < 1.2 ? 'sedang' : 'rendah';
  const maxLoss = ctx.equity ? ` (≈ $${((ctx.equity * out) / 100 * lossOnMargin).toFixed(2)} bila SL kena)` : '';
  return { pct: out, mode, risk, source: 'local', reason: `${notes.join('; ')}. Margin ${out}% ${mode}${maxLoss}.` };
}

/** Bounds an AI-proposed advice by the local baseline so the model can never push risk far above it. */
export function boundAdvice(ai: Partial<MarginAdvice> & { pct: number }, base: MarginAdvice, s: Signal): MarginAdvice {
  const cap = clampPct(base.pct * 1.5);
  const pct = Math.max(1, Math.min(cap, clampPct(ai.pct)));
  let mode: MarginMode = ai.mode === 'Cross' ? 'Cross' : 'Isolated';
  if (s.leverage > 20) mode = 'Isolated';
  const risk = (['rendah', 'sedang', 'tinggi'] as const).includes(ai.risk as MarginAdvice['risk']) ? (ai.risk as MarginAdvice['risk']) : base.risk;
  return { pct, mode, risk: risk === 'rendah' && base.risk === 'tinggi' ? 'tinggi' : risk, source: 'ai', reason: (ai.reason || base.reason).slice(0, 280) };
}

/** Margin actually used for a call: manual override > AI advice (when enabled) > fixed setting. */
export function effectiveMargin(settings: MarginSettings, rec: MarginOverride): { pct: number; mode: MarginMode; from: 'manual' | 'ai' | 'default' } {
  if (rec.marginPct) return { pct: clampPct(rec.marginPct), mode: rec.marginMode || settings.marginMode, from: 'manual' };
  if (settings.marginSource === 'ai' && rec.advice) return { pct: rec.advice.pct, mode: rec.advice.mode, from: 'ai' };
  return { pct: clampPct(settings.marginPct), mode: rec.marginMode || settings.marginMode, from: 'default' };
}
