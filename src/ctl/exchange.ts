import { useCallback } from 'react';
import { getExchange } from '../exchanges';
import { activeKeys } from '../security';
import { rollBaseline } from '../safety';
import { money } from '../format';
import type { Core } from './core';

export function useExchangePart(k: Core) {
  const { setSettings, setEquityHistory, setAccount, setPositions, setOpenOrders, credsRef, settingsRef, notify, run } = k;
  /* ---------- exchange (live account) ---------- */
  const syncAccount = useCallback(async (quiet = false) => {
    await run('exchange', async () => {
      const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
      const [a, p] = await Promise.all([ex.account(keys), ex.positions(keys)]);
      setAccount(a); setPositions(p);
      const eq = Number(a.equity);
      if (Number.isFinite(eq)) { const base = rollBaseline(settingsRef.current.dayBaseline, eq); if (base !== settingsRef.current.dayBaseline) setSettings((cur) => ({ ...cur, dayBaseline: base })); }
      try { setOpenOrders(await ex.openOrders(keys)); } catch { /* order list is optional */ }
      if (Number.isFinite(eq)) setEquityHistory((h) => (h.length && Date.now() - h[h.length - 1].t < 60000 ? [...h.slice(0, -1), { t: Date.now(), v: eq }] : [...h, { t: Date.now(), v: eq }].slice(-40)));
      if (!quiet) notify(`${ex.label} tersinkron`, 'success');
    });
  }, [run, notify]);

  const testExchange = useCallback(async () => {
    await run('exchange-test', async () => {
      const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
      const price = await ex.lastPrice(keys.env, 'BTCUSDT');
      await ex.account(keys);
      notify(`${ex.label} terhubung · BTC $${money(price)}`, 'success');
    });
  }, [run, notify]);

  return { syncAccount, testExchange };
}
export type ExchangePart = ReturnType<typeof useExchangePart>;
