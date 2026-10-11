import { useCallback } from 'react';
import { baseOf, getExchange } from '../exchanges';
import { activeKeys } from '../security';
import { entryRange, takeProfitLevels, type SignalRecord } from '../signal';
import { activeAlerts, evaluateAlerts } from '../alerts';
import { cancelDemoOrder, checkTriggers, closeDemoFraction, decideEntry, demoEquity, initialDemo, openDemo, processOrders, qtyForMargin, qtyStepFor, queueDemoOrder, updateDemoTpSl, validateDemoLevels, type DemoSide, type DemoState } from '../demo';
import { effectiveMargin } from '../advice';
import { type MarginMode } from '../domain';
import { coinGeckoLivePrices } from '../coingecko';
import { errorMessage, money } from '../format';
import { DEFAULT_WATCH, demoPriceProvider } from './core';
import type { Core } from './core';
import type { ExchangePart } from './exchange';

export function useDemoPart(k: Core & ExchangePart) {
  const { setSettings, setDemo, setTickers, setPrices, setPricesError, setPriceUpdatedAt, setDemoHistory, credsRef, settingsRef, demoRef, pricesRef, priceProviderRef, demoDone, instCache, notify, alertUser } = k;
  /* ---------- demo / market ---------- */
  const commitDemo = useCallback((next: DemoState) => { demoRef.current = next; setDemo(next); }, []);

  const sizingFor = useCallback((_symbol: string, price: number) => ({ step: qtyStepFor(price), minQty: 0 }), []);
  const loadInstrument = useCallback(async (symbol: string) => {
    if (instCache.current[symbol]) return instCache.current[symbol];
    const c = credsRef.current; const i = await getExchange(c.exchange).instrument(activeKeys(c).env, symbol);
    instCache.current[symbol] = i; return i;
  }, []);

  const pushDemoHistory = useCallback(() => {
    const v = demoEquity(demoRef.current, pricesRef.current);
    if (!Number.isFinite(v)) return;
    setDemoHistory((h) => { const last = h[h.length - 1]; return last && Date.now() - last.t < 60000 && Math.abs(last.v - v) < 0.005 ? h : [...h, { t: Date.now(), v }].slice(-300); });
  }, []);

  const refreshPrices = useCallback(async (extra: string[] = [], force = false) => {
    const currentSettings = settingsRef.current;
    const currentCredentials = credsRef.current;
    const provider = demoPriceProvider(currentSettings, currentCredentials);
    const providerKey = `${currentSettings.demoPriceSource}:${currentCredentials.exchange}:${activeKeys(currentCredentials).env}`;
    if (priceProviderRef.current !== providerKey) {
      priceProviderRef.current = providerKey;
      pricesRef.current = {}; setPrices({}); setTickers([]); setPricesError(''); setPriceUpdatedAt(0);
    }
    const symbols = Array.from(new Set([...DEFAULT_WATCH, currentSettings.demoSymbol, ...demoRef.current.positions.map((p) => p.symbol), ...demoRef.current.orders.map((o) => o.symbol), ...activeAlerts(currentSettings.alerts).map((a) => a.symbol), ...extra]));
    try {
      const list = currentSettings.demoPriceSource === 'exchange'
        ? (await getExchange(currentCredentials.exchange).tickers(activeKeys(currentCredentials).env, symbols)).map((ticker) => ({ ...ticker, baseSymbol: baseOf(ticker.symbol), updatedAt: Date.now() }))
        : await coinGeckoLivePrices(symbols, force);
      if (!list.length) { setPricesError(`${provider} tidak menemukan harga market untuk ${symbols.join(', ')}.`); return false; }
      const freshPrices: Record<string, number> = {};
      list.forEach((t) => { if (t.last > 0) freshPrices[t.symbol] = t.last; });
      const map: Record<string, number> = { ...pricesRef.current, ...freshPrices };
      pricesRef.current = map; setPrices(map);
      const required = Array.from(new Set([currentSettings.demoSymbol, ...extra]));
      const missing = required.filter((symbol) => !(freshPrices[symbol] > 0));
      setPricesError(missing.length ? `${provider} tidak menyediakan quote terbaru untuk ${missing.join(', ')}.` : '');
      setPriceUpdatedAt(Date.now());
      setTickers((old) => { const next = [...old.filter((o) => !list.some((t) => t.symbol === o.symbol)), ...list]; return next; });
      const fired = evaluateAlerts(settingsRef.current.alerts, freshPrices);
      if (fired.fired.length) { setSettings((cur) => ({ ...cur, alerts: evaluateAlerts(cur.alerts, freshPrices).alerts })); fired.fired.forEach((a) => alertUser(`${baseOf(a.symbol)} ${a.dir === 'above' ? '≥' : '≤'} $${money(a.price)} · Alert harga tercapai`, 'info')); }
      const filled = processOrders(demoRef.current, freshPrices, sizingFor);
      if (filled.events.length) { commitDemo(filled.state); filled.events.forEach((e) => e.kind === 'filled' ? alertUser(`Open Entry · ${baseOf(e.order.symbol)} ${e.order.side} terisi — ${e.reason}`, 'success', 'bolt') : alertUser(`Order ${baseOf(e.order.symbol)} ${e.kind === 'rejected' ? 'ditolak' : 'dibatalkan'} · ${e.reason}`, 'warning', 'warning')); }
      const r = checkTriggers(demoRef.current, freshPrices);
      if (r.events.length) { commitDemo(r.state); r.events.forEach((e) => {
        const pnl = `${e.pnl >= 0 ? '+' : '−'}$${Math.abs(e.pnl).toFixed(2)}`;
        const coin = baseOf(e.position.symbol);
        if (e.reason === 'Likuidasi') alertUser(`LIKUIDASI · ${coin} ${e.position.side} terlikuidasi ${pnl}`, 'error', 'warning');
        else if (e.reason === 'Stop Loss') alertUser(`Kena Stop Loss · ${coin} ${e.position.side} ${pnl}`, 'error', 'error');
        else if (e.reason.startsWith('Take Profit')) alertUser(`Kena ${e.reason} · ${coin} ${e.position.side} ${pnl}`, 'success', 'check');
        else alertUser(`${e.reason} · ${coin} ${e.position.side} ${pnl}`, 'info');
      }); }
      pushDemoHistory();
      return missing.length === 0;
    } catch (error) { setPricesError(errorMessage(error)); return false; /* preserve the last quote during a transient network error */ }
  }, [commitDemo, notify, alertUser, pushDemoHistory, sizingFor]);

  const demoOpenManual = useCallback(async (side: DemoSide, qty: number, leverage: number, marginMode: MarginMode = settingsRef.current.marginMode, options: { orderType?: 'market' | 'limit'; entry?: string; takeProfit?: string; stopLoss?: string } = {}, selectedSymbol?: string) => {
    const symbol = selectedSymbol || settingsRef.current.demoSymbol;
    const provider = demoPriceProvider(settingsRef.current, credsRef.current);
    try {
      const refreshed = await refreshPrices([symbol], true);
      if (!refreshed) throw new Error(`Quote terbaru ${provider} gagal dimuat; order demo tidak dibuat.`);
      const p = pricesRef.current[symbol];
      if (!p) throw new Error(`Harga ${provider} belum tersedia. Coba lagi sebentar.`);
      const parseLevel = (raw?: string) => {
        if (!raw?.trim()) return undefined;
        const n = Number(raw.trim().replace(',', '.'));
        if (!(n > 0) || !Number.isFinite(n)) throw new Error('Harga TP/SL atau entry tidak valid.');
        return n;
      };
      const takeProfit = parseLevel(options.takeProfit); const stopLoss = parseLevel(options.stopLoss);
      if (options.orderType === 'limit') {
        const entry = parseLevel(options.entry);
        if (!entry) throw new Error('Isi harga entry untuk order limit.');
        if (side === 'LONG' ? entry >= p : entry <= p) throw new Error(`Limit ${side} harus ${side === 'LONG' ? 'di bawah' : 'di atas'} harga ${provider} saat ini.`);
        validateDemoLevels(side, entry, { takeProfit, stopLoss });
        commitDemo(queueDemoOrder(demoRef.current, { symbol, side, entry, qty, leverage, marginPct: 0, marginMode, takeProfit, stopLoss, orderType: 'limit', source: 'Manual limit', waitFor: side === 'LONG' ? 'down' : 'up' }));
        alertUser(`Limit menunggu · ${baseOf(symbol)} ${side} @ $${money(entry)}`, 'info', 'clock');
        return;
      }
      validateDemoLevels(side, p, { takeProfit, stopLoss });
      commitDemo(openDemo(demoRef.current, { symbol, side, qty, price: p, leverage, takeProfit, stopLoss, source: 'Manual', marginMode }));
      alertUser(`Open Entry · ${baseOf(symbol)} ${side} @ $${money(p)}`, 'success', 'bolt');
    } catch (error) { notify(errorMessage(error), 'error'); }
  }, [commitDemo, notify, alertUser, refreshPrices]);

  const demoClose = useCallback(async (id: string, fraction = 1) => {
    const pos = demoRef.current.positions.find((p) => p.id === id);
    if (!pos) return;
    const refreshed = await refreshPrices([pos.symbol], true);
    const price = pricesRef.current[pos.symbol] || pos.entry;
    if (!refreshed) notify(`Menggunakan quote ${demoPriceProvider(settingsRef.current, credsRef.current)} terakhir yang tersimpan untuk menutup ${pos.symbol}.`, 'info');
    const r = closeDemoFraction(demoRef.current, id, price, fraction, 'Manual');
    commitDemo(r.state);
    if (r.event) notify(`Demo ${pos.symbol} ditutup ${Math.round(fraction * 100)}% · PnL ${r.event.pnl >= 0 ? '+' : '−'}$${Math.abs(r.event.pnl).toFixed(2)}`, r.event.pnl >= 0 ? 'success' : 'info');
  }, [commitDemo, notify, refreshPrices]);

  const demoSetTpSl = useCallback((id: string, levels: { takeProfit?: number; stopLoss?: number }) => {
    try { commitDemo(updateDemoTpSl(demoRef.current, id, levels)); notify('TP/SL diperbarui', 'success'); }
    catch (error) { notify(errorMessage(error), 'error'); }
  }, [commitDemo, notify]);

  const demoReset = useCallback(() => { commitDemo(initialDemo()); demoDone.current.clear(); notify('Akun demo di-reset · $10,000', 'info'); }, [commitDemo, notify]);

  const demoFromSignal = useCallback(async (record: SignalRecord, source = 'Signal') => {
    if (demoDone.current.has(record.id)) return;
    demoDone.current.add(record.id);
    try {
      const refreshed = await refreshPrices([record.symbol], true);
      if (!refreshed) throw new Error(`Quote ${record.symbol} tidak tersedia dari sumber harga Demo yang dipilih.`);
      const price = pricesRef.current[record.symbol];
      if (!price) throw new Error(`Harga ${record.symbol} belum tersedia dari sumber harga Demo yang dipilih.`);
      const m = effectiveMargin(settingsRef.current, record);
      const leverage = Math.max(1, Math.min(125, record.leverage));
      const band = entryRange(record);
      const targets = takeProfitLevels(record);
      const entry = decideEntry(record.direction, record.entry, price, record.stopLoss, targets[0], 0.002, band.low, band.high);
      if (entry.kind === 'stale') throw new Error(`Call ${record.symbol} basi: ${entry.reason}`);
      const label = `${source} · ${m.pct}% ${m.mode}${m.from === 'ai' ? ' (AI)' : ''}`;
      if (entry.kind === 'pending') {
        const entryPrice = entry.targetPrice || record.entry;
        commitDemo(queueDemoOrder(demoRef.current, { symbol: record.symbol, side: record.direction, entry: entryPrice, leverage, marginPct: m.pct, marginMode: m.mode, takeProfit: targets[0], takeProfits: targets, stopLoss: record.stopLoss, orderType: 'signal', source: label, waitFor: entry.waitFor! }));
        notify(`${record.symbol} ${record.direction} menunggu · zona ${band.low}–${band.high}`, 'info');
        return;
      }
      const { step, minQty } = sizingFor(record.symbol, price);
      const qty = qtyForMargin(demoRef.current.balance, m.pct, leverage, price, step, minQty);
      commitDemo(openDemo(demoRef.current, { symbol: record.symbol, side: record.direction, qty, price, leverage, takeProfit: targets[0], takeProfits: targets, stopLoss: record.stopLoss, source: label, marginMode: m.mode }));
      alertUser(`Open Entry · ${baseOf(record.symbol)} ${record.direction} @ $${money(price)}`, 'success', 'bolt');
    } catch (error) { demoDone.current.delete(record.id); notify(errorMessage(error), 'error'); }
  }, [commitDemo, notify, alertUser, refreshPrices, sizingFor]);

  const demoCancelOrder = useCallback((id: string) => { commitDemo(cancelDemoOrder(demoRef.current, id)); notify('Order dibatalkan', 'info'); }, [commitDemo, notify]);

  return { commitDemo, sizingFor, loadInstrument, pushDemoHistory, refreshPrices, demoOpenManual, demoClose, demoSetTpSl, demoReset, demoFromSignal, demoCancelOrder };
}
export type DemoPart = ReturnType<typeof useDemoPart>;
