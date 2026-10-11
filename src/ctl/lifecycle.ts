import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { activeKeys, emptyCredentials, loadCredentials } from '../security';
import { loadState, saveState } from '../store';
import { isBackgroundRunning, startBackgroundMonitoring } from '../background';
import { activeAlerts } from '../alerts';
import { liquidationPrice } from '../demo';
import { baseOf } from '../exchanges';
import { money, price as fmtPrice } from '../format';
import { diffPositions, nextRiskAlerts, riskMessage, type RiskInput, type RiskLevel, type SeenPosition } from '../riskAlerts';
import type { Core } from './core';
import type { ExchangePart } from './exchange';
import type { DemoPart } from './demo';
import type { SignalsPart } from './signals';
import type { TelegramPart } from './telegram';
import type { AutomationPart } from './automation';
import type { ManagePart } from './manage';
import type { ReplayPart } from './replay';
import type { OrdersPart } from './orders';
import type { SafetyPart } from './safety';

export function useLifecyclePart(k: Core & ExchangePart & DemoPart & SignalsPart & TelegramPart & AutomationPart & ManagePart & ReplayPart & OrdersPart & SafetyPart) {
  const { positions, prices, ready, setReady, credentials, setCredentials, settings, setSettings, signals, setSignals, equityHistory, setEquityHistory, chatTitles, setChatTitles, serviceOn, setServiceOn, demo, appActive, setAppActive, demoHistory, setDemoHistory, credsRef, settingsRef, demoDone, watching, loadMarket, patchSettings, syncAccount, commitDemo, refreshPrices, connectTelegram, alertUser } = k;
  /* ---------- lifecycle ---------- */
  useEffect(() => {
    (async () => {
      const [creds, state, running] = await Promise.all([loadCredentials().catch(() => emptyCredentials()), loadState(), isBackgroundRunning()]);
      credsRef.current = creds; settingsRef.current = state.settings;
      setCredentials(creds); setSettings(state.settings); setSignals(state.signals); setEquityHistory(state.equityHistory); setChatTitles(state.chatTitles); setDemoHistory(state.demoHistory || []); commitDemo(state.demo);
      state.signals.forEach((s) => demoDone.current.add(s.id));
      setServiceOn(running);
      if (creds.telegramApiId.trim() && creds.telegramApiHash.trim()) connectTelegram(true);
      setReady(true);
      if (state.settings.automationOn && !running) { try { startBackgroundMonitoring(); setServiceOn(true); } catch { /* ignore */ } }
      loadMarket(true);
      if (state.settings.accountMode === 'demo') refreshPrices([], true);
      else if (activeKeys(creds).apiKey && activeKeys(creds).apiSecret) syncAccount(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- exchange-style position alerts: liquidation proximity, plus open / TP / SL detection for Live ---------- */
  const riskState = useRef<Record<string, RiskLevel>>({});
  const seenLive = useRef<{ mode: string; list: SeenPosition[] | null }>({ mode: '', list: null });
  useEffect(() => {
    if (!ready) return;
    const live = settings.accountMode === 'live';
    const modeKey = live ? `live:${credentials.exchange}` : 'demo';
    if (seenLive.current.mode !== modeKey) { seenLive.current = { mode: modeKey, list: null }; riskState.current = {}; }
    let items: RiskInput[];
    if (live) {
      const list: SeenPosition[] = positions.map((p) => ({ key: `${p.symbol}:${p.side}`, symbol: p.symbol, side: p.side, entry: Number(p.avgPrice) || 0, mark: Number(p.markPrice) || 0, sl: Number(p.stopLoss) || undefined, tp: Number(p.takeProfit) || undefined }));
      const before = seenLive.current.list;
      if (before) diffPositions(before, list).forEach((e) => {
        const coin = `${baseOf(e.position.symbol)} ${e.position.side}`;
        if (e.kind === 'opened') alertUser(`Open Entry · ${coin} @ $${fmtPrice(e.position.entry)}`, 'success', 'bolt');
        else if (e.kind === 'tp') alertUser(`Kena Take Profit · ${coin}`, 'success', 'check');
        else if (e.kind === 'sl') alertUser(`Kena Stop Loss · ${coin}`, 'error', 'error');
        else alertUser(`Posisi ditutup · ${coin}`, 'info', 'check');
      });
      seenLive.current.list = list;
      items = positions.map((p) => ({ key: `${p.symbol}:${p.side}`, symbol: baseOf(p.symbol), side: p.side, entry: Number(p.avgPrice) || 0, liq: Number(p.liqPrice) || 0, mark: Number(p.markPrice) || 0 }));
    } else {
      items = demo.positions.map((p) => ({ key: p.id, symbol: baseOf(p.symbol), side: p.side, entry: p.entry, liq: liquidationPrice(p, demo.balance), mark: prices[p.symbol] || 0 }));
    }
    const res = nextRiskAlerts(riskState.current, items);
    riskState.current = res.state;
    res.alerts.forEach((a) => alertUser(riskMessage(a, (n) => (n >= 100 ? money(n) : fmtPrice(n))), a.level === 2 ? 'error' : 'warning', a.level === 2 ? 'bell' : 'warning'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings.accountMode, credentials.exchange, positions, demo.positions, demo.balance, prices]);

  useEffect(() => {
    if (!ready) return undefined;
    const id = setTimeout(() => { saveState({ settings, signals, equityHistory, chatTitles, demo, demoHistory }).catch(() => undefined); }, 600);
    return () => clearTimeout(id);
  }, [ready, settings, signals, equityHistory, chatTitles, demo, demoHistory]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state === 'active') {
        isBackgroundRunning().then((running) => { setServiceOn(running); if (!running && settingsRef.current.automationOn) patchSettings({ automationOn: false }); });
        loadMarket(true);
        if (settingsRef.current.accountMode === 'demo') refreshPrices([], true);
        else {
          const current = credsRef.current;
          if (activeKeys(current).apiKey && activeKeys(current).apiSecret) syncAccount(true);
        }
      }
    });
    return () => sub.remove();
  }, [patchSettings, loadMarket, refreshPrices, syncAccount, credsRef, settingsRef, setAppActive, setServiceOn]);

  useEffect(() => {
    if (!ready || !watching || !appActive || settings.accountMode !== 'live') return undefined;
    const k = activeKeys(credentials);
    if (!k.apiKey || !k.apiSecret) return undefined;
    const id = setInterval(() => syncAccount(true), 20000);
    return () => clearInterval(id);
  }, [ready, watching, appActive, settings.accountMode, credentials, syncAccount]);

  const demoMarketEnv = credentials.keys[credentials.exchange].env;
  const needPrices = ready && (settings.accountMode === 'demo' || demo.positions.length > 0 || demo.orders.length > 0 || activeAlerts(settings.alerts).length > 0);
  useEffect(() => {
    if (!needPrices || (!appActive && !serviceOn)) return undefined;
    refreshPrices();
    const id = setInterval(() => refreshPrices(), 60000);
    return () => clearInterval(id);
  }, [needPrices, appActive, serviceOn, settings.demoSymbol, settings.demoPriceSource, credentials.exchange, demoMarketEnv, demo.positions.length, demo.orders.length, settings.alerts, refreshPrices]);

  return { demoMarketEnv, needPrices };
}
export type LifecyclePart = ReturnType<typeof useLifecyclePart>;
