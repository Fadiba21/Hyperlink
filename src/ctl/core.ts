import { useCallback, useRef, useState } from 'react';
import { getExchange, type Account, type ClosedTrade, type Instrument, type OpenOrder, type ExchangeId, type ExchangeKeys, type OrderPlan, type Position } from '../exchanges';
import { GEMINI_DEFAULT_MODELS, type GeminiModel } from '../gemini';
import { emptyCredentials, saveCredentials, type Credentials } from '../security';
import { defaultSettings, type Settings } from '../store';
import { type SignalRecord, type StreamMessage } from '../signal';
import { type AuthStep, type TelegramChat } from '../telegram';
import { showAlert } from '../background';
import { initialDemo, type DemoState } from '../demo';
import { useMarket } from '../market';
import { type CoinGeckoTicker } from '../coingecko';
import { errorMessage } from '../format';
import type { IconName } from '../icons';

export type Toast = { id: number; message: string; tone: 'info' | 'error' | 'success' | 'warning'; icon?: IconName };
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const DEFAULT_WATCH = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
export const demoPriceProvider = (settings: Settings, credentials: Credentials) => settings.demoPriceSource === 'exchange' ? getExchange(credentials.exchange).label : 'CoinGecko';

export function useCore() {
  const [ready, setReady] = useState(false);
  const [credentials, setCredentials] = useState<Credentials>(emptyCredentials());
  const [credsDirty, setCredsDirty] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [equityHistory, setEquityHistory] = useState<Array<{ t: number; v: number }>>([]);
  const [chatTitles, setChatTitles] = useState<Record<string, string>>({});
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [stream, setStream] = useState<StreamMessage[]>([]);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [authStep, setAuthStep] = useState<AuthStep>('idle');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [serviceOn, setServiceOn] = useState(false);
  const [sheet, setSheet] = useState<{ signal: SignalRecord; plan: OrderPlan | null; error?: string; manual?: boolean } | null>(null);
  const [demo, setDemo] = useState<DemoState>(initialDemo());
  const [tickers, setTickers] = useState<CoinGeckoTicker[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricesError, setPricesError] = useState('');
  const [priceUpdatedAt, setPriceUpdatedAt] = useState(0);
  const [geminiModels, setGeminiModels] = useState<GeminiModel[]>(GEMINI_DEFAULT_MODELS);
  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [appActive, setAppActive] = useState(true);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [history, setHistory] = useState<ClosedTrade[]>([]);
  const [demoHistory, setDemoHistory] = useState<Array<{ t: number; v: number }>>([]);

  const credsRef = useRef(credentials); credsRef.current = credentials;
  const appActiveRef = useRef(appActive); appActiveRef.current = appActive;
  const positionsRef = useRef<Position[]>([]); positionsRef.current = positions;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const titlesRef = useRef(chatTitles); titlesRef.current = chatTitles;
  const accountRef = useRef<Account | null>(null); accountRef.current = account;
  const demoRef = useRef(demo); demoRef.current = demo;
  const pricesRef = useRef(prices); pricesRef.current = prices;
  const priceProviderRef = useRef('');
  const signalsRef = useRef(signals); signalsRef.current = signals;
  const seen = useRef<Set<string>>(new Set());
  const demoDone = useRef<Set<string>>(new Set());
  const queue = useRef<Array<{ streamId: string; text: string; source: string; callTime?: number }>>([]);
  const working = useRef(false);
  const instCache = useRef<Record<string, Instrument>>({});
  const [watching, setWatching] = useState(false);
  const mkt = useMarket();
  const loadMarket = mkt.loadMarket;

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => setToast({ id: Date.now(), message, tone }), []);
  const dismissToast = useCallback(() => setToast(null), []);
  /** Important event: toast in the app, system notification when the app is in the background. "Title · detail" splits into two lines. */
  const alertUser = useCallback((message: string, tone: Toast['tone'] = 'info', icon?: IconName) => {
    setToast({ id: Date.now(), message, tone, icon });
    if (!appActiveRef.current && settingsRef.current.notifyEvents) {
      const cut = message.indexOf(' · ');
      showAlert(cut > 0 ? message.slice(0, cut) : message, cut > 0 ? message.slice(cut + 3) : 'Hyperlink', Math.floor(Date.now() / 1000));
    }
  }, []);
  const run = useCallback(async <T,>(key: string, job: () => Promise<T>): Promise<T | undefined> => {
    setBusy((b) => ({ ...b, [key]: true }));
    try { return await job(); } catch (error) { notify(errorMessage(error), 'error'); return undefined; } finally { setBusy((b) => ({ ...b, [key]: false })); }
  }, [notify]);

  const patchSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const updateCred = useCallback(<K extends 'telegramApiId' | 'telegramApiHash' | 'geminiApiKey' | 'coingeckoKey'>(key: K, value: string) => { setCredentials((c) => ({ ...c, [key]: value })); setCredsDirty(true); }, []);
  const updateKeys = useCallback((patch: Partial<ExchangeKeys>) => { setCredentials((c) => ({ ...c, keys: { ...c.keys, [c.exchange]: { ...c.keys[c.exchange], ...patch } } })); setCredsDirty(true); }, []);
  const selectExchange = useCallback((id: ExchangeId) => {
    setCredentials((c) => ({ ...c, exchange: id })); setCredsDirty(true);
    setAccount(null); setPositions([]); setOpenOrders([]); setHistory([]); instCache.current = {};
  }, []);

  const saveCreds = useCallback(async (silent = false) => {
    try {
      const c = credsRef.current;
      const trimmed: Credentials = { ...c, telegramApiId: c.telegramApiId.trim(), telegramApiHash: c.telegramApiHash.trim(), geminiApiKey: c.geminiApiKey.trim(), keys: Object.fromEntries(Object.entries(c.keys).map(([id, k]) => [id, { ...k, apiKey: k.apiKey.trim(), apiSecret: k.apiSecret.trim(), passphrase: k.passphrase.trim() }])) as Credentials['keys'] };
      await saveCredentials(trimmed);
      setCredsDirty(false);
      if (!silent) notify('Tersimpan · terenkripsi di perangkat', 'success');
      return true;
    } catch (error) { notify(`Gagal menyimpan: ${errorMessage(error)}`, 'error'); return false; }
  }, [notify]);

  return { ready, setReady, credentials, setCredentials, credsDirty, setCredsDirty, settings, setSettings, signals, setSignals, equityHistory, setEquityHistory, chatTitles, setChatTitles, account, setAccount, positions, setPositions, stream, setStream, chats, setChats, authStep, setAuthStep, busy, setBusy, toast, setToast, serviceOn, setServiceOn, sheet, setSheet, demo, setDemo, tickers, setTickers, prices, setPrices, pricesError, setPricesError, priceUpdatedAt, setPriceUpdatedAt, geminiModels, setGeminiModels, geminiStatus, setGeminiStatus, appActive, setAppActive, openOrders, setOpenOrders, history, setHistory, demoHistory, setDemoHistory, credsRef, appActiveRef, positionsRef, settingsRef, titlesRef, accountRef, demoRef, pricesRef, priceProviderRef, signalsRef, seen, demoDone, queue, working, instCache, watching, setWatching, mkt, loadMarket, notify, dismissToast, alertUser, run, patchSettings, updateCred, updateKeys, selectExchange, saveCreds };
}
export type Core = ReturnType<typeof useCore>;
