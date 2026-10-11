import { useCore, type Toast } from './ctl/core';
import { useExchangePart } from './ctl/exchange';
import { useDemoPart } from './ctl/demo';
import { useSignalsPart } from './ctl/signals';
import { useTelegramPart } from './ctl/telegram';
import { useAutomationPart } from './ctl/automation';
import { useManagePart } from './ctl/manage';
import { useReplayPart } from './ctl/replay';
import { useOrdersPart } from './ctl/orders';
import { useSafetyPart } from './ctl/safety';
import { useLifecyclePart } from './ctl/lifecycle';

export type { Toast };

export function useController() {
  const s0 = useCore();
  const p1 = useExchangePart(s0);
  const s1 = { ...s0, ...p1 };
  const p2 = useDemoPart(s1);
  const s2 = { ...s1, ...p2 };
  const p3 = useSignalsPart(s2);
  const s3 = { ...s2, ...p3 };
  const p4 = useTelegramPart(s3);
  const s4 = { ...s3, ...p4 };
  const p5 = useAutomationPart(s4);
  const s5 = { ...s4, ...p5 };
  const p6 = useManagePart(s5);
  const s6 = { ...s5, ...p6 };
  const p7 = useReplayPart(s6);
  const s7 = { ...s6, ...p7 };
  const p8 = useOrdersPart(s7);
  const s8 = { ...s7, ...p8 };
  const p9 = useSafetyPart(s8);
  const s9 = { ...s8, ...p9 };
  const p10 = useLifecyclePart(s9);
  const s10 = { ...s9, ...p10 };
  const { ready, credentials, credsDirty, settings, signals, equityHistory, chatTitles, account, positions, stream, chats, authStep, busy, toast, serviceOn, sheet, demo, tickers, prices, pricesError, priceUpdatedAt, geminiModels, geminiStatus, openOrders, history, demoHistory, setWatching, mkt, notify, dismissToast, alertUser, patchSettings, updateCred, updateKeys, selectExchange, saveCreds, syncAccount, testExchange, refreshPrices, demoOpenManual, demoClose, demoSetTpSl, demoReset, demoFromSignal, demoCancelOrder, askAdvice, setSignalMargin, applyAdvice, analyzeManual, testGemini, analyzeStreamMessage, loadChats, connectTelegram, sendPhone, sendCode, sendPassword, toggleChat, disconnectTelegram, scanHistory, setAutomation, closeLivePosition, closeAllLive, setLiveTpSl, cancelLiveOrder, setLiveLeverage, loadHistory, simulateSignal, simulateAll, openOrder, openManualOrder, closeSheet, executeOrder, dismissSignal, removeSignal, wipeAll, setKillSwitch, addPriceAlert, removeAlert, exportDemo, importDemo } = s10;

  return {
    ready, openOrders, history, demoHistory, setKillSwitch, cancelLiveOrder, setLiveLeverage, loadHistory, addPriceAlert, removeAlert, exportDemo, importDemo, alertUser, credentials, credsDirty, settings, signals, equityHistory, account, positions, stream, chats, authStep, busy, toast, serviceOn, sheet, demo, tickers, prices, pricesError, priceUpdatedAt, geminiModels, geminiStatus, chatTitles,
    updateCred, updateKeys, selectExchange, saveCreds, patchSettings, syncAccount, testExchange, analyzeManual, testGemini, analyzeStreamMessage, connectTelegram, sendPhone, sendCode, sendPassword, loadChats, toggleChat, disconnectTelegram, scanHistory,
    setAutomation, openOrder, openManualOrder, closeSheet, executeOrder, dismissSignal, removeSignal, wipeAll, notify, dismissToast, refreshPrices,
    demoOpenManual, demoClose, demoSetTpSl, demoReset, demoFromSignal, demoCancelOrder,
    askAdvice, setSignalMargin, applyAdvice, closeLivePosition, closeAllLive, setLiveTpSl, simulateSignal, simulateAll, setWatching,
    market: mkt.market, loadMarket: mkt.loadMarket, loadCoins: mkt.loadCoins, openCoin: mkt.openCoin, closeCoin: mkt.closeCoin,
  };
}
export type Controller = ReturnType<typeof useController>;
