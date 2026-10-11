import * as Keychain from 'react-native-keychain';
import type { SignalRecord } from './signal';
import { initialDemo, normalizeDemo, type DemoState } from './demo';
import type { DayBaseline } from './safety';
import type { PriceAlert } from './alerts';
import type { SoundTemplate } from './sounds';

const STATE_SERVICE = 'com.tradepilotnative.state';

export type Settings = {
  marginPct: number;
  marginMode: 'Cross' | 'Isolated';
  automationOn: boolean;
  selectedChatIds: number[];
  geminiModel: string;
  themeMode: 'system' | 'light' | 'dark';
  themeStyle: 'monochrome' | 'materialYou' | 'midnightExchange' | 'emeraldWallet' | 'aurora' | 'copperStudio';
  soundEnabled: boolean;
  soundTemplate: SoundTemplate;
  soundVolume: number;
  telegramEnabled: boolean;
  minConfidence: number;
  accountMode: 'live' | 'demo';
  demoAutoEntry: boolean;
  liveAutoEntry: boolean;
  demoSymbol: string;
  demoPriceSource: 'coingecko' | 'exchange';
  marginSource: 'fixed' | 'ai';
  riskPerTradePct: number;
  aiAdvice: boolean;
  introSeen: boolean;
  favoritePairs: string[];
  safetyKill: boolean;
  readOnly: boolean;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  confirmLeverage: number;
  dayBaseline: DayBaseline;
  hideBalances: boolean;
  lockEnabled: boolean;
  biometricUnlock: boolean;
  alerts: PriceAlert[];
  notifyEvents: boolean;
};

export type PersistedState = {
  settings: Settings;
  signals: SignalRecord[];
  equityHistory: Array<{ t: number; v: number }>;
  chatTitles: Record<string, string>;
  demo: DemoState;
  demoHistory?: Array<{ t: number; v: number }>;
};

export const defaultSettings: Settings = {
  marginPct: 4, marginMode: 'Isolated', automationOn: false, selectedChatIds: [], geminiModel: 'gemini-flash-latest',
  themeMode: 'system', themeStyle: 'monochrome', soundEnabled: true, soundTemplate: 'deafdeep', soundVolume: 0.45, telegramEnabled: false, minConfidence: 0.8, accountMode: 'live', demoAutoEntry: true, liveAutoEntry: false, demoSymbol: 'BTCUSDT', demoPriceSource: 'coingecko',
  marginSource: 'fixed', riskPerTradePct: 2, aiAdvice: true, introSeen: false, favoritePairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  safetyKill: false, readOnly: false, maxDailyLossPct: 5, maxOpenPositions: 5, confirmLeverage: 20, dayBaseline: null, hideBalances: false, lockEnabled: false, biometricUnlock: false, alerts: [], notifyEvents: true,
};

export const emptyState = (): PersistedState => ({ settings: defaultSettings, signals: [], equityHistory: [], chatTitles: {}, demo: initialDemo(), demoHistory: [] });

export async function loadState(): Promise<PersistedState> {
  try {
    const item = await Keychain.getGenericPassword({ service: STATE_SERVICE });
    if (!item) return emptyState();
    const p = JSON.parse(item.password) as Partial<PersistedState>;
    const settings = (p.settings || {}) as Partial<Settings>;
    return {
      settings: { ...defaultSettings, ...settings, soundTemplate: ((settings.soundTemplate as string | undefined) === 'wnd11' ? 'deafdeep' : settings.soundTemplate || defaultSettings.soundTemplate) as SoundTemplate, introSeen: true, favoritePairs: Array.isArray(settings.favoritePairs) ? settings.favoritePairs.filter((x) => typeof x === 'string').slice(0, 60) : defaultSettings.favoritePairs, alerts: Array.isArray(settings.alerts) ? settings.alerts.filter((a) => a && typeof a.symbol === 'string' && Number(a.price) > 0).slice(0, 50) : [], dayBaseline: settings.dayBaseline && typeof settings.dayBaseline.day === 'string' && Number(settings.dayBaseline.equity) > 0 ? settings.dayBaseline : null },
      signals: Array.isArray(p.signals) ? p.signals : [],
      equityHistory: Array.isArray(p.equityHistory) ? p.equityHistory : [],
      chatTitles: p.chatTitles || {},
      demo: p.demo && Array.isArray(p.demo.positions) ? normalizeDemo(p.demo) : initialDemo(),
      demoHistory: Array.isArray(p.demoHistory) ? p.demoHistory.filter((x) => x && Number.isFinite(x.t) && Number.isFinite(x.v)).slice(-300) : [],
    };
  } catch { return emptyState(); }
}

export async function saveState(state: PersistedState): Promise<void> {
  const trimmed: PersistedState = { ...state, demoHistory: (state.demoHistory || []).slice(-300), signals: state.signals.slice(0, 40), equityHistory: state.equityHistory.slice(-40), demo: { ...state.demo, closed: state.demo.closed.slice(0, 100) } };
  await Keychain.setGenericPassword('state', JSON.stringify(trimmed), { service: STATE_SERVICE });
}

export async function clearState(): Promise<void> { await Keychain.resetGenericPassword({ service: STATE_SERVICE }); }
