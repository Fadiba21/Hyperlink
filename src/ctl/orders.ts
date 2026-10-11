import { useCallback } from 'react';
import { Alert } from 'react-native';
import { getExchange, planManualOrder, planOrder } from '../exchanges';
import { activeKeys, clearCredentials, emptyCredentials } from '../security';
import { clearState, defaultSettings } from '../store';
import { entryRange, takeProfitLevels, type SignalRecord } from '../signal';
import { logoutTelegram } from '../telegram';
import { stopBackgroundMonitoring } from '../background';
import { checkLiveOrder } from '../safety';
import { initialDemo } from '../demo';
import { effectiveMargin } from '../advice';
import { errorMessage } from '../format';
import type { Core } from './core';
import type { ExchangePart } from './exchange';
import type { DemoPart } from './demo';
import type { SignalsPart } from './signals';
import type { TelegramPart } from './telegram';
import type { AutomationPart } from './automation';
import type { ManagePart } from './manage';
import type { ReplayPart } from './replay';

export function useOrdersPart(k: Core & ExchangePart & DemoPart & SignalsPart & TelegramPart & AutomationPart & ManagePart & ReplayPart) {
  const { setCredentials, setCredsDirty, setSettings, setSignals, setEquityHistory, setAccount, setPositions, setStream, setChats, setAuthStep, setServiceOn, sheet, setSheet, setGeminiStatus, setOpenOrders, setHistory, setDemoHistory, credsRef, positionsRef, settingsRef, accountRef, notify, alertUser, run, syncAccount, commitDemo } = k;
  /* ---------- live orders ---------- */
  const openOrder = useCallback(async (record: SignalRecord) => {
    setSheet({ signal: record, plan: null });
    try {
      const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
      const a = accountRef.current || (await ex.account(keys));
      setAccount(a);
      const m = effectiveMargin(settingsRef.current, record);
      const band = entryRange(record);
      const targets = takeProfitLevels(record);
      const plan = await planOrder(ex, keys, { symbol: record.symbol, side: record.direction === 'LONG' ? 'Buy' : 'Sell', takeProfit: targets[0], stopLoss: record.stopLoss, leverage: record.leverage, marginMode: m.mode, marginPct: m.pct, available: Number(a.available), entry: record.entry, entryLow: band.low, entryHigh: band.high });
      const verdict = checkLiveOrder({ settings: settingsRef.current, plan, equity: Number(a.equity) || 0, positionCount: positionsRef.current.length, baseline: settingsRef.current.dayBaseline });
      plan.warnings.unshift(...verdict.blocked.map((x) => `⛔ ${x}`), ...verdict.confirm.map((x) => `⚠ ${x}`));
      plan.warnings.push(`Margin ${m.pct}% ${m.mode} (${m.from === 'ai' ? 'saran AI' : m.from === 'manual' ? 'atur manual' : 'default pengaturan'}).`);
      if (targets.length > 1) plan.warnings.push(`Call ini memiliki ${targets.length} target. ${ex.label} memasang TP1 sebagai TP exchange; target berikutnya tetap tercatat pada call dan dapat dikelola dari menu posisi.`);
      setSheet({ signal: record, plan });
    } catch (error) { setSheet({ signal: record, plan: null, error: errorMessage(error) }); }
  }, [accountRef, credsRef, positionsRef, setAccount, setSheet, settingsRef]);
  const openManualOrder = useCallback(async (draft: { symbol: string; side: 'Buy' | 'Sell'; quantity: number; leverage: number; marginMode: 'Cross' | 'Isolated'; stopLoss: string; takeProfit: string }) => {
    const manualId = `manual-${Date.now()}`;
    const placeholder: SignalRecord = { id: manualId, symbol: draft.symbol, direction: draft.side === 'Buy' ? 'LONG' : 'SHORT', entry: 1, stopLoss: Number(draft.stopLoss) || 0, takeProfit: Number(draft.takeProfit) || 0, leverage: draft.leverage, confidence: 1, rationale: 'Order market manual', source: 'Manual', text: '', createdAt: Date.now(), status: 'ready' };
    setSheet({ signal: placeholder, plan: null, manual: true });
    try {
      const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
      const a = await ex.account(keys);
      setAccount(a);
      const takeProfit = draft.takeProfit.trim() ? Number(draft.takeProfit.trim().replace(',', '.')) : undefined;
      const plan = await planManualOrder(ex, keys, { symbol: draft.symbol, side: draft.side, quantity: draft.quantity, leverage: draft.leverage, marginMode: draft.marginMode, stopLoss: Number(draft.stopLoss.trim().replace(',', '.')), takeProfit, available: Number(a.available) || 0 });
      const verdict = checkLiveOrder({ settings: settingsRef.current, plan, equity: Number(a.equity) || 0, positionCount: positionsRef.current.length, baseline: settingsRef.current.dayBaseline });
      plan.warnings.unshift(...verdict.blocked.map((x) => `⛔ ${x}`), ...verdict.confirm.map((x) => `⚠ ${x}`));
      setSheet({ signal: { ...placeholder, entry: plan.lastPrice, stopLoss: Number(plan.stopLoss), takeProfit: Number(plan.takeProfit) || 0 }, plan, manual: true });
    } catch (error) { setSheet({ signal: placeholder, plan: null, error: errorMessage(error), manual: true }); }
  }, [credsRef, positionsRef, setAccount, setSheet, settingsRef]);
  const closeSheet = useCallback(() => setSheet(null), [setSheet]);

  const executeOrder = useCallback(() => {
    if (!sheet?.plan) return;
    const { signal, plan } = sheet;
    const manual = Boolean(sheet.manual);
    const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
    const go = async () => {
      await run('order', async () => {
        try {
          const result = await ex.submit(keys, plan);
          if (!manual) setSignals((list) => list.map((x) => (x.id === signal.id ? { ...x, status: 'executed', orderId: result.orderId, note: result.warning } : x)));
          setSheet(null);
          alertUser(result.warning ? `Order diterima · ${ex.label} ${plan.symbol} (${result.orderId}) · ${result.warning}` : `Order diterima · ${ex.label} ${plan.symbol} (${result.orderId})`, result.warning ? 'info' : 'success');
          syncAccount(true);
        } catch (error) {
          if (!manual) setSignals((list) => list.map((x) => (x.id === signal.id ? { ...x, status: 'failed', note: errorMessage(error) } : x)));
          alertUser(`Order gagal · ${errorMessage(error)}`, 'error');
        }
      });
    };
    const live = keys.env === 'mainnet';
    const guard = settingsRef.current;
    const verdict = checkLiveOrder({ settings: guard, plan, equity: Number(accountRef.current?.equity) || 0, positionCount: positionsRef.current.length, baseline: guard.dayBaseline });
    if (!verdict.ok) { notify(verdict.blocked[0], 'error'); return; }
    const extra = verdict.confirm.length ? `\n\n⚠ ${verdict.confirm.join('\n⚠ ')}` : '';
    const tpLine = Number(plan.takeProfit) > 0 ? `\nTP ${plan.takeProfit}` : '\nTP tidak dipasang';
    Alert.alert(live ? `${manual ? 'Kirim order manual LIVE' : 'Kirim order LIVE'} di ${ex.label}?` : `Kirim order ${ex.testnetLabel || 'uji'} di ${ex.label}?`, `${plan.side === 'Buy' ? 'LONG' : 'SHORT'} ${plan.symbol}\nEntry market ≈ ${plan.lastPrice}\nQty ${plan.qty} · ${plan.leverage}x ${plan.marginMode}\nSL ${plan.stopLoss}${tpLine}\nMargin ≈ ${plan.margin.toFixed(2)} USDT · Maks. rugi ≈ ${plan.maxLoss.toFixed(2)} USDT${live ? '\n\nIni memakai uang sungguhan.' : ''}${extra}`, [{ text: 'Batal', style: 'cancel' }, { text: 'Kirim', style: live ? 'destructive' : 'default', onPress: go }]);
  }, [sheet, run, notify, alertUser, syncAccount, accountRef, credsRef, positionsRef, setSheet, setSignals, settingsRef]);

  const dismissSignal = useCallback((id: string) => setSignals((list) => list.map((x) => (x.id === id ? { ...x, status: 'dismissed' } : x))), [setSignals]);
  const removeSignal = useCallback((id: string) => setSignals((list) => list.filter((x) => x.id !== id)), [setSignals]);

  const wipeAll = useCallback(async () => {
    try {
      stopBackgroundMonitoring();
      try { await logoutTelegram(); } catch { /* not logged in */ }
      await clearCredentials(); await clearState();
      setCredentials(emptyCredentials()); setSettings({ ...defaultSettings, introSeen: true }); setSignals([]); setEquityHistory([]); setAccount(null); setPositions([]); setStream([]); setChats([]); setAuthStep('idle'); setServiceOn(false); setCredsDirty(false); commitDemo(initialDemo()); setDemoHistory([]); setOpenOrders([]); setHistory([]); setGeminiStatus('idle');
      notify('Data lokal dihapus', 'info');
    } catch (error) { notify(errorMessage(error), 'error'); }
  }, [notify, commitDemo, setCredentials, setCredsDirty, setSettings, setSignals, setEquityHistory, setAccount, setPositions, setStream, setChats, setAuthStep, setServiceOn, setDemoHistory, setOpenOrders, setHistory, setGeminiStatus]);

  return { openOrder, openManualOrder, closeSheet, executeOrder, dismissSignal, removeSignal, wipeAll };
}
export type OrdersPart = ReturnType<typeof useOrdersPart>;
