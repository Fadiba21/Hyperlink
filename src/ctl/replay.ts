import { useCallback } from 'react';
import { effectiveMargin } from '../advice';
import { simulateCall } from '../simulate';
import { coinGeckoHistoricalCandles } from '../coingecko';
import type { Core } from './core';
import type { ExchangePart } from './exchange';
import type { DemoPart } from './demo';
import type { SignalsPart } from './signals';
import type { TelegramPart } from './telegram';
import type { AutomationPart } from './automation';
import type { ManagePart } from './manage';

export function useReplayPart(k: Core & ExchangePart & DemoPart & SignalsPart & TelegramPart & AutomationPart & ManagePart) {
  const { setSignals, settingsRef, signalsRef, notify, run } = k;
  /* ---------- replay a call against real candles ---------- */
  const simulateSignal = useCallback(async (id: string, quiet = false) => {
    const rec = signalsRef.current.find((x) => x.id === id); if (!rec) return;
    await run(`sim-${id}`, async () => {
      const since = rec.callTime ?? rec.createdAt;
      const candles = await coinGeckoHistoricalCandles(rec.symbol, since);
      if (!candles.length) throw new Error(`Data candle ${rec.symbol} belum tersedia dari CoinGecko untuk waktu tersebut.`);
      const m = effectiveMargin(settingsRef.current, rec);
      const sim = simulateCall(rec, candles, since, { marginPct: m.pct, marginMode: m.mode });
      setSignals((list) => list.map((x) => (x.id === id ? { ...x, sim } : x)));
      if (!quiet) notify(`Simulasi ${rec.symbol}: ${{ TP: 'TP tercapai', SL: 'SL kena', open: 'masih berjalan', noentry: 'entry tidak pernah tersentuh', liquidated: 'terlikuidasi' }[sim.outcome]}${sim.pnlPct !== undefined ? ` · ${sim.pnlPct >= 0 ? '+' : ''}${sim.pnlPct.toFixed(2)}% saldo` : ''}`, sim.outcome === 'TP' ? 'success' : 'info');
    });
  }, [run, notify]);

  const simulateAll = useCallback(async () => {
    const todo = signalsRef.current.filter((x) => !x.sim || x.sim.outcome === 'open').slice(0, 20);
    if (!todo.length) { notify('Semua call sudah disimulasikan.', 'info'); return; }
    for (const r of todo) await simulateSignal(r.id, true);
    notify(`${todo.length} call disimulasikan dengan candle asli.`, 'success');
  }, [simulateSignal, notify]);

  return { simulateSignal, simulateAll };
}
export type ReplayPart = ReturnType<typeof useReplayPart>;
