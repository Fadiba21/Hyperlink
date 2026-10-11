import { useCallback, useRef } from 'react';
import { analyzeSignal, listGeminiModels, testGeminiConnection } from '../gemini';
import { entryRange, looksLikeCall, parseTelegramCall, takeProfitLevels, type Signal, type SignalRecord, type StreamMessage } from '../signal';
import { type TelegramMessage } from '../telegram';
import { demoEquity } from '../demo';
import { adviseMargin } from '../gemini';
import { effectiveMargin, localAdvice, type MarginAdvice } from '../advice';
import { type MarginMode } from '../domain';
import { errorMessage } from '../format';
import { activeKeys } from '../security';
import { getExchange, planOrder } from '../exchanges';
import { checkLiveOrder, isLiveAutoEntryEnabled } from '../safety';
import { uid } from './core';
import type { Core } from './core';
import type { ExchangePart } from './exchange';
import type { DemoPart } from './demo';

export function useSignalsPart(k: Core & ExchangePart & DemoPart) {
  const { signals, setSignals, setAccount, setPositions, stream, setStream, setGeminiModels, setGeminiStatus, credsRef, settingsRef, titlesRef, accountRef, demoRef, pricesRef, seen, queue, working, notify, alertUser, run, syncAccount, demoFromSignal } = k;
  /* ---------- Gemini / signals ---------- */
  const liveAutoDone = useRef(new Set<string>());
  const liveAutoFromSignal = useCallback(async (record: SignalRecord) => {
    if (liveAutoDone.current.has(record.id)) return;
    liveAutoDone.current.add(record.id);
    try {
      if (!isLiveAutoEntryEnabled(settingsRef.current)) return;
      const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
      if (!keys.apiKey.trim() || !keys.apiSecret.trim() || (ex.needsPassphrase && !keys.passphrase.trim())) throw new Error(`Lengkapi API ${ex.label} di Pengaturan sebelum auto-entry Live.`);
      const [account, positions] = await Promise.all([ex.account(keys), ex.positions(keys)]);
      setAccount(account); setPositions(positions);
      const settings = settingsRef.current;
      if (!isLiveAutoEntryEnabled(settings)) return;
      const current = credsRef.current;
      if (current.exchange !== c.exchange || current.keys[c.exchange].env !== keys.env || current.keys[c.exchange].apiKey !== keys.apiKey) return;
      const margin = effectiveMargin(settings, record);
      const band = entryRange(record); const targets = takeProfitLevels(record);
      const plan = await planOrder(ex, keys, { symbol: record.symbol, side: record.direction === 'LONG' ? 'Buy' : 'Sell', takeProfit: targets[0], stopLoss: record.stopLoss, leverage: record.leverage, marginMode: margin.mode, marginPct: margin.pct, available: Number(account.available), entry: record.entry, entryLow: band.low, entryHigh: band.high });
      const latest = settingsRef.current;
      if (!isLiveAutoEntryEnabled(latest)) return;
      const verdict = checkLiveOrder({ settings: latest, plan, equity: Number(account.equity) || 0, positionCount: positions.length, baseline: latest.dayBaseline });
      if (!verdict.ok) throw new Error(verdict.blocked.join(' '));
      if (verdict.confirm.length) {
        const reason = verdict.confirm.join(' ');
        setSignals((list) => list.map((x) => x.id === record.id ? { ...x, note: `Auto-entry Live perlu ditinjau: ${reason}` } : x));
        notify(`Auto-entry ${record.symbol} ditahan · perlu tinjauan manual: ${reason}`, 'info');
        return;
      }
      if (!isLiveAutoEntryEnabled(settingsRef.current)) return;
      const result = await ex.submit(keys, plan);
      setSignals((list) => list.map((x) => x.id === record.id ? { ...x, status: 'executed', orderId: result.orderId, note: result.warning ? `Auto-entry Live · ${result.warning}` : 'Auto-entry Live' } : x));
      alertUser(result.warning ? `Auto-entry ${record.symbol} diterima · ${result.warning}` : `Auto-entry ${record.direction} ${record.symbol} diterima ${ex.label}`, result.warning ? 'info' : 'success');
      void syncAccount(true);
    } catch (error) {
      const message = errorMessage(error);
      setSignals((list) => list.map((x) => x.id === record.id ? { ...x, note: `Auto-entry Live dilewati: ${message}` } : x));
      notify(`Auto-entry Live dilewati · ${record.symbol}: ${message}`, 'error');
    }
  }, [alertUser, credsRef, notify, setAccount, setPositions, setSignals, settingsRef, syncAccount]);

  const addSignal = useCallback((signal: Signal, source: string, text: string, callTime?: number, auto = true): SignalRecord => {
    const record: SignalRecord = { ...signal, id: uid(), source, text, createdAt: Date.now(), callTime, status: 'ready' };
    setSignals((s) => [record, ...s].slice(0, 60));
    if (auto && settingsRef.current.automationOn && settingsRef.current.demoAutoEntry && settingsRef.current.accountMode === 'demo') demoFromSignal(record, source);
    if (auto && isLiveAutoEntryEnabled(settingsRef.current)) void liveAutoFromSignal(record);
    return record;
  }, [demoFromSignal, liveAutoFromSignal, setSignals, settingsRef]);

  const adviceContext = useCallback(() => {
    const s = settingsRef.current;
    const equity = s.accountMode === 'demo' ? demoEquity(demoRef.current, pricesRef.current) : Number(accountRef.current?.equity) || undefined;
    return { riskPerTradePct: s.riskPerTradePct, marginMode: s.marginMode, equity };
  }, [accountRef, demoRef, pricesRef, settingsRef]);
  const makeAdvice = useCallback(async (signal: Signal): Promise<MarginAdvice> => {
    const s = settingsRef.current; const ctx = adviceContext();
    return s.aiAdvice ? adviseMargin(credsRef.current.geminiApiKey, signal, ctx, s.geminiModel) : localAdvice(signal, ctx);
  }, [adviceContext, credsRef, settingsRef]);

  const analyzeText = useCallback(async (text: string, source: string, callTime?: number, auto = true): Promise<SignalRecord> => {
    const s = settingsRef.current;
    const signal = await analyzeSignal(credsRef.current.geminiApiKey, text, s.geminiModel, s.minConfidence);
    signal.advice = await makeAdvice(signal);
    return addSignal(signal, source, text, callTime, auto);
  }, [addSignal, makeAdvice, credsRef, settingsRef]);

  /** Re-asks the advisor for an existing call (uses current balance/risk settings). */
  const askAdvice = useCallback(async (id: string) => {
    const rec = signals.find((x) => x.id === id); if (!rec) return;
    await run(`advice-${id}`, async () => {
      const advice = await makeAdvice(rec);
      setSignals((list) => list.map((x) => (x.id === id ? { ...x, advice } : x)));
      notify(`Saran margin ${advice.pct}% · ${advice.mode}`, 'success');
    });
  }, [signals, run, makeAdvice, notify, setSignals]);

  const setSignalMargin = useCallback((id: string, pct: number | undefined, mode?: MarginMode) => setSignals((list) => list.map((x) => (x.id === id ? { ...x, marginPct: pct, marginMode: mode ?? x.marginMode } : x))), [setSignals]);
  const applyAdvice = useCallback((id: string) => setSignals((list) => list.map((x) => (x.id === id && x.advice ? { ...x, marginPct: x.advice.pct, marginMode: x.advice.mode } : x))), [setSignals]);

  const analyzeManual = useCallback(async (text: string) => {
    const record = await run('gemini', () => analyzeText(text, 'Manual', undefined, false));
    if (record) notify(`Signal ${record.symbol} ${record.direction} · valid`, 'success');
    return record;
  }, [run, analyzeText, notify]);

  const testGemini = useCallback(async () => {
    await run('gemini-test', async () => {
      setGeminiStatus('idle');
      try {
        const key = credsRef.current.geminiApiKey;
        const models = await listGeminiModels(key);
        setGeminiModels(models);
        await testGeminiConnection(key, settingsRef.current.geminiModel);
        setGeminiStatus('ok');
        notify(`Gemini online · ${models.length} model`, 'success');
      } catch (error) { setGeminiStatus('error'); throw error; }
    });
  }, [run, notify, credsRef, setGeminiModels, setGeminiStatus, settingsRef]);

  const processQueue = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    while (queue.current.length) {
      const job = queue.current.shift()!;
      try {
        const record = await analyzeText(job.text, job.source, job.callTime);
        setStream((m) => m.map((x) => (x.id === job.streamId ? { ...x, result: 'accepted', reason: `${record.symbol} ${record.direction}` } : x)));
        alertUser(`Signal ${record.symbol} ${record.direction} · ${job.source}`, 'success');
      } catch (error) {
        setStream((m) => m.map((x) => (x.id === job.streamId ? { ...x, result: 'rejected', reason: errorMessage(error) } : x)));
      }
    }
    working.current = false;
  }, [analyzeText, alertUser, queue, setStream, working]);

  const enqueue = useCallback((streamId: string, text: string, source: string, callTime?: number) => {
    if (!credsRef.current.geminiApiKey.trim() && !parseTelegramCall(text)) {
      setStream((m) => m.map((x) => x.id === streamId ? { ...x, result: 'skipped', reason: 'Format ini memerlukan Gemini API Key' } : x));
      notify('Call ini memerlukan Gemini API Key karena formatnya belum dikenali langsung.', 'error'); return;
    }
    if (queue.current.length >= 5) { setStream((m) => m.map((x) => (x.id === streamId ? { ...x, result: 'skipped', reason: 'Antrian analisis penuh' } : x))); return; }
    queue.current.push({ streamId, text, source, callTime });
    setStream((m) => m.map((x) => (x.id === streamId ? { ...x, result: 'pending', reason: undefined } : x)));
    processQueue();
  }, [processQueue, notify, credsRef, queue, setStream]);

  const analyzeStreamMessage = useCallback((id: string) => {
    const msg = stream.find((m) => m.id === id);
    if (msg) enqueue(msg.id, msg.text, msg.chatTitle, msg.createdAt);
  }, [stream, enqueue]);

  const pushStream = useCallback((m: TelegramMessage, auto: boolean, reason?: string) => {
    const title = titlesRef.current[String(m.chatId)] || `Chat ${m.chatId}`;
    const item: StreamMessage = { id: `${m.chatId}:${m.messageId}`, chatId: m.chatId, chatTitle: title, text: m.text, createdAt: (m.date ? m.date * 1000 : Date.now()), result: auto ? 'pending' : 'skipped', reason };
    setStream((list) => (list.some((x) => x.id === item.id) ? list : [item, ...list].slice(0, 40)));
    return item;
  }, [setStream, titlesRef]);

  const onIncoming = useCallback((message: TelegramMessage) => {
    if (message.outgoing) return;
    const s = settingsRef.current;
    if (!s.selectedChatIds.includes(message.chatId)) return;
    const key = `${message.chatId}:${message.messageId}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    if (seen.current.size > 500) seen.current = new Set(Array.from(seen.current).slice(-250));
    const auto = s.automationOn && looksLikeCall(message.text);
    const item = pushStream(message, auto, auto ? undefined : s.automationOn ? 'Bukan format call' : 'Automation mati');
    if (auto) enqueue(item.id, message.text, item.chatTitle, item.createdAt);
  }, [enqueue, pushStream, seen, settingsRef]);

  return { addSignal, adviceContext, makeAdvice, analyzeText, askAdvice, setSignalMargin, applyAdvice, analyzeManual, testGemini, processQueue, enqueue, analyzeStreamMessage, pushStream, onIncoming };
}
export type SignalsPart = ReturnType<typeof useSignalsPart>;
